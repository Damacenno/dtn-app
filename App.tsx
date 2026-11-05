import './global.css';

import React, { useEffect, useState } from 'react';

import {
  Alert,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import NfcManager from 'react-native-nfc-manager';

import type { Message } from './src/types/Message';

import {
  MESSAGE_CATALOG,
  getMessageLabel,
  type MessageCode,
} from './src/constants/messageCatalog';

import {
  getMessages,
  saveMessages,
  getDeviceId,
} from './src/database/messageStorage';

import {
  createMessage,
  removeExpiredMessages,
} from './src/utils/messageUtils';

import {
  synchronizeWithTag,
} from './src/nfc/nfcService';

import {
  refreshDeliveredCacheFromApi,
} from './src/services/apiService';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedCode, setSelectedCode] = useState<MessageCode>(
    MESSAGE_CATALOG[0].code
  );
  const [deviceId, setDeviceId] = useState('');
  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState('');

  // Estado para controlar a abertura do modal do dropdown acadêmico
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const supported = await NfcManager.isSupported();

        if (supported) {
          await NfcManager.start();
        }

        const storedMessages = await getMessages();
        const validMessages = removeExpiredMessages(
          storedMessages
        );

        const id = await getDeviceId();

        if (!mounted) {
          return;
        }

        setNfcAvailable(supported);
        setMessages(validMessages);
        setDeviceId(id);

        if (
          validMessages.length !== storedMessages.length
        ) {
          await saveMessages(validMessages);
        }

        try {
          await refreshDeliveredCacheFromApi();
        } catch (error) {
          console.warn(
            '[CACHE] Atualização inicial indisponível:',
            error
          );
        }

      } catch (error) {
        console.error('[APP] Erro na inicialização:', error);
      }
    }

    initialize();

    const subscription = AppState.addEventListener(
      'change',
      state => {
        if (state === 'active') {
          refreshDeliveredCacheFromApi().catch(error => {
            console.warn(
              '[CACHE] Atualização ao retornar:',
              error
            );
          });
        }
      }
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  async function handleAddMessage() {
    if (!deviceId) {
      Alert.alert(
        'Aguarde',
        'O dispositivo ainda está sendo inicializado.'
      );
      return;
    }

    const newMessage = createMessage(
      selectedCode,
      deviceId
    );

    const updatedMessages = [
      ...messages,
      newMessage,
    ];

    await saveMessages(updatedMessages);
    setMessages(updatedMessages);

    Alert.alert(
      'Mensagem criada',
      'A mensagem foi salva no armazenamento local. Ela será distribuída na próxima aproximação de uma TAG.'
    );
  }

  async function handleSynchronize() {
    if (busy) {
      return;
    }

    if (!nfcAvailable) {
      Alert.alert(
        'NFC indisponível',
        'Este dispositivo não possui NFC disponível.'
      );
      return;
    }

    setBusy(true);
    setLastResult('Aguardando TAG NFC...');

    try {
      const result = await synchronizeWithTag(
        messages,
        'PONTO-001',
        deviceId
      );

      await saveMessages(result.messages);
      setMessages(result.messages);

      const details = [
        `Mensagens na TAG: ${result.storedOnTag.length}`,
        `Mensagens entregues ao servidor: ${result.deliveredCount}`,
        `Mensagens expiradas removidas: ${result.expiredCount}`,
        `Mensagens não armazenadas: ${result.omittedCount}`,
      ];

      if (result.tagWriteError) {
        details.push(
          `Erro na TAG: ${result.tagWriteError}`
        );
      }

      if (result.apiError) {
        details.push(
          `Erro na API: ${result.apiError}`
        );
      }

      const summary = details.join('\n');

      setLastResult(summary);

      if (result.tagWriteError || result.apiError) {
        Alert.alert('Sincronização parcial', summary);
      } else {
        Alert.alert('Sincronização concluída', summary);
      }

    } catch (error: any) {
      const message =
        error?.message || 'Não foi possível sincronizar.';

      setLastResult(message);

      Alert.alert('Erro na sincronização', message);

    } finally {
      setBusy(false);
    }
  }

  const pendingCount = messages.filter(
    message => !message.deliveredAt
  ).length;

  const deliveredCount = messages.filter(
    message => !!message.deliveredAt
  ).length;

  async function handleClearMessages() {
    Alert.alert(
      'Limpar mensagens locais',
      'Deseja apagar todas as mensagens armazenadas neste celular? As mensagens nas TAGs e no servidor não serão afetadas.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Apagar mensagens',
          style: 'destructive',
          onPress: async () => {
            try {
              await saveMessages([]);
              setMessages([]);
              Alert.alert(
                'Concluído',
                'Todas as mensagens locais foram apagadas.'
              );
            } catch (error) {
              Alert.alert(
                'Erro',
                'Não foi possível apagar as mensagens locais.'
              );
            }
          },
        },
      ]
    );
  }

  const selectedItemLabel = `${selectedCode} — ${getMessageLabel(selectedCode)}`;

  return (
    <View className="flex-1 bg-slate-950">
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-6 pb-44"
      >
        {/* Cabeçalho Acadêmico */}
        <View className="mb-8 mt-6 border-b border-slate-800/80 pb-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-serif font-bold tracking-tight text-white">
              DTN Messenger
            </Text>
            <View className="rounded-md bg-indigo-500/10 px-2.5 py-1 border border-indigo-500/20">
              <Text className="text-[10px] font-medium tracking-wider text-indigo-400 uppercase">
                Pesquisa & IoT
              </Text>
            </View>
          </View>

          <Text className="mt-1 text-xs text-slate-400 font-sans">
            Protocolo de Comunicação Tolerante a Atrasos por NFC
          </Text>

          <Text className="mt-3 font-mono text-[11px] text-slate-500">
            NODE_ID: {deviceId ? deviceId.slice(0, 24) + '...' : 'Inicializando...'}
          </Text>
        </View>

        {/* Status do Nó / Métricas */}
        <View className="mb-6 rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
          <Text className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Métricas do Nó
          </Text>

          <View className="flex-row justify-between py-1.5 border-b border-slate-800/50">
            <Text className="text-sm text-slate-400">
              Interface NFC
            </Text>
            <Text className={`text-sm font-medium ${nfcAvailable ? 'text-emerald-400' : 'text-rose-400'}`}>
              {nfcAvailable ? 'Ativo' : 'Inativo'}
            </Text>
          </View>

          <View className="flex-row justify-between py-1.5 border-b border-slate-800/50">
            <Text className="text-sm text-slate-400">
              Pacotes Pendentes
            </Text>
            <Text className="text-sm font-medium text-white font-mono">
              {pendingCount}
            </Text>
          </View>

          <View className="flex-row justify-between py-1.5">
            <Text className="text-sm text-slate-400">
              Entregues ao Servidor
            </Text>
            <Text className="text-sm font-medium text-indigo-400 font-mono">
              {deliveredCount}
            </Text>
          </View>
        </View>

        {/* Criação de Mensagem (Dropdown Acadêmico) */}
        <View className="mb-6 rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
          <Text className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Gerar Nova Mensagem
          </Text>

          <Text className="mb-2 text-xs text-slate-400">
            Selecione o payload do catálogo:
          </Text>

          {/* Gatilho do Dropdown */}
          <Pressable
            onPress={() => setDropdownOpen(true)}
            className="mb-3 flex-row items-center justify-between rounded-lg border border-slate-700 bg-slate-800/80 p-3.5"
          >
            <Text className="text-sm text-white font-medium pr-2" numberOfLines={1}>
              {selectedItemLabel}
            </Text>
            <Text className="text-xs text-indigo-400 font-bold">▼</Text>
          </Pressable>

          <Pressable
            onPress={handleAddMessage}
            className="items-center rounded-lg bg-indigo-600 py-3.5 active:bg-indigo-700"
          >
            <Text className="text-sm font-semibold text-white">
              Criar e Enfileirar Mensagem
            </Text>
          </Pressable>
        </View>

        {/* Último Resultado */}
        {lastResult ? (
          <View className="mb-6 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <Text className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Log de Execução
            </Text>
            <Text className="font-mono text-xs leading-5 text-slate-300">
              {lastResult}
            </Text>
          </View>
        ) : null}

        {/* Fila de Mensagens Locais */}
        <View className="mb-4">
          <Text className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Buffer Local ({messages.length})
          </Text>

          {messages.length === 0 ? (
            <View className="rounded-xl border border-dashed border-slate-800 p-6 items-center justify-center">
              <Text className="text-xs text-slate-500 text-center">
                Buffer vazio. Nenhuma mensagem pendente ou armazenada localmente.
              </Text>
            </View>
          ) : (
            messages.map(message => (
              <View
                key={message.id}
                className="mb-2.5 rounded-xl border border-slate-800 bg-slate-900/40 p-3.5"
              >
                <Text className="text-sm font-medium text-white">
                  {getMessageLabel(message.code)}
                </Text>

                <View className="mt-2 flex-row items-center justify-between">
                  <Text className="font-mono text-[10px] text-slate-500">
                    ID: {message.id}
                  </Text>
                  <Text className={`text-[11px] font-medium ${message.deliveredAt ? 'text-indigo-400' : 'text-amber-400/90'}`}>
                    {message.deliveredAt ? '• Entregue' : '• Na fila'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Botões Suspensos Inferiores (Estilo Nubank / Ações Rápidas) */}
      <View className="absolute bottom-0 left-0 right-0 border-t border-slate-800/80 bg-slate-950/95 px-5 py-4 backdrop-blur-md">
        <View className="flex-row gap-3">
          <Pressable
            disabled={busy || !nfcAvailable}
            onPress={handleSynchronize}
            className={`flex-1 items-center justify-center rounded-xl py-4 shadow-lg ${busy || !nfcAvailable
                ? 'bg-slate-800 opacity-60'
                : 'bg-indigo-600 active:bg-indigo-700'
              }`}
          >
            <Text className="text-sm font-bold text-white">
              {busy ? 'Aguardando TAG...' : 'Aproximar TAG e Sincronizar'}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleClearMessages}
            disabled={busy || messages.length === 0}
            className={`items-center justify-center rounded-xl border px-4 py-4 ${busy || messages.length === 0
                ? 'border-slate-800 bg-slate-900/50 opacity-40'
                : 'border-rose-500/30 bg-rose-500/10 active:bg-rose-500/20'
              }`}
          >
            <Text className="text-xs font-semibold text-rose-400">
              Limpar
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Modal / Dropdown customizado estilo Acadêmico */}
      <Modal
        visible={dropdownOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/70">
          <View className="rounded-t-3xl border-t border-slate-800 bg-slate-900 p-6 max-h-[70%]">
            <View className="flex-row items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <Text className="text-base font-semibold text-white">
                Selecionar Mensagem do Catálogo
              </Text>
              <Pressable onPress={() => setDropdownOpen(false)}>
                <Text className="text-sm font-bold text-indigo-400">✕</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerClassName="pb-6">
              {MESSAGE_CATALOG.map(item => {
                const isSelected = selectedCode === item.code;
                return (
                  <Pressable
                    key={item.code}
                    onPress={() => {
                      setSelectedCode(item.code);
                      setDropdownOpen(false);
                    }}
                    className={`mb-2.5 rounded-xl border p-4 ${isSelected
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-slate-800 bg-slate-800/50'
                      }`}
                  >
                    <Text className={`text-sm ${isSelected ? 'font-semibold text-indigo-400' : 'text-white'}`}>
                      {item.code} — {getMessageLabel(item.code)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}