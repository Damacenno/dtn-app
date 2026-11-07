
import { Ndef } from 'react-native-nfc-manager';

import type { Message, NfcEnvelope } from '../types/Message';
import type { MessageCode } from '../constants/messageCatalog';

interface CompactMessageV2 {
    i: string;
    o: string;
    t: number;
    e: number;
    c: string;
}

interface CompactMessageV3 {
    i: string;
    o: string;
    t: string;
    e: string;
    c: string;
}

function encodeBase36(value: number): string {
    return value.toString(36);
}

function decodeBase36(value: string): number {
    if (!/^[0-9a-z]+$/i.test(value)) {
        throw new Error(`Timestamp base36 inválido: ${value}`);
    }

    const decoded = parseInt(value, 36);

    if (!Number.isSafeInteger(decoded) || decoded < 0) {
        throw new Error('Timestamp inválido na TAG NFC.');
    }

    return decoded;
}

function validateMessage(message: any): boolean {
    return (
        typeof message.i === 'string' &&
        typeof message.o === 'string' &&
        typeof message.c === 'string' &&
        message.i.length > 0 &&
        message.o.length > 0
    );
}

function normalizeMessage(
    message: any,
    version: number
): Message {
    if (!validateMessage(message)) {
        throw new Error('Identificação ou código da mensagem inválido.');
    }

    let createdAt: number;
    let expiresAt: number;

    if (version === 2) {
        if (
            typeof message.t !== 'number' ||
            typeof message.e !== 'number' ||
            !Number.isFinite(message.t) ||
            !Number.isFinite(message.e)
        ) {
            throw new Error('Timestamp inválido na mensagem v2.');
        }

        createdAt = message.t;
        expiresAt = message.e;
    } else if (version === 3) {
        if (
            typeof message.t !== 'string' ||
            typeof message.e !== 'string'
        ) {
            throw new Error('Timestamp inválido na mensagem v3.');
        }

        createdAt = decodeBase36(message.t);
        expiresAt = decodeBase36(message.e);
    } else {
        throw new Error('Versão do protocolo NFC incompatível.');
    }

    return {
        id: message.i,
        originDevice: message.o,
        createdAt,
        expiresAt,
        code: message.c as MessageCode,
    };
}

export function encodeEnvelope(
    pointId: string,
    messages: Message[]
): number[] {
    const envelope = {
        v: 3,
        p: pointId,
        m: messages.map(message => ({
            i: message.id,
            o: message.originDevice,
            t: encodeBase36(message.createdAt),
            e: encodeBase36(message.expiresAt),
            c: message.code,
        })),
    };

    const json = JSON.stringify(envelope);

    const encoded = Ndef.encodeMessage([
        Ndef.textRecord(json),
    ]);

    console.log('[NFC] Point ID:', pointId);
    console.log('[NFC] Versão do protocolo:', 3);
    console.log('[NFC] Quantidade de mensagens:', messages.length);
    console.log('[NFC] JSON:', json);
    console.log(
        '[NFC] Tamanho do JSON:',
        new TextEncoder().encode(json).length
    );
    console.log('[NFC] Bytes codificados:', encoded.length);

    return encoded;
}

export function decodeEnvelope(records: any[]): NfcEnvelope | null {
    if (!records || records.length === 0) {
        return null;
    }

    console.log('[NFC] Registros NDEF encontrados:', records.length);

    const textRecord = records.find(record =>
        Ndef.isType(
            record,
            Ndef.TNF_WELL_KNOWN,
            Ndef.RTD_TEXT
        )
    );

    if (!textRecord) {
        console.warn('[NFC] Nenhum registro NDEF de texto encontrado.');
        return null;
    }

    let json: string;

    try {
        json = Ndef.text.decodePayload(
            new Uint8Array(textRecord.payload)
        ).replace(/^\uFEFF/, '').trim();
    } catch (error) {
        console.error('[NFC] Falha ao decodificar texto NDEF:', error);
        throw new Error('Não foi possível decodificar o conteúdo da TAG.');
    }

    console.log('[NFC] Conteúdo bruto recebido:', json);

    let data: any;

    try {
        data = JSON.parse(json);
    } catch (error) {
        console.error('[NFC] JSON inválido:', json);
        throw new Error('O conteúdo da TAG não contém um JSON válido.');
    }

    if (data.type === 'NFC_POINT') {
        if (
            typeof data.id !== 'string' ||
            !data.id.trim()
        ) {
            throw new Error('Identificador do ponto NFC inválido.');
        }

        return {
            version: 2,
            pointId: data.id,
            messages: [],
        };
    }

    const pointId = data.p ?? data.pointId;
    let rawMessages = data.m ?? data.messages;

    if (typeof rawMessages === 'string') {
        try {
            rawMessages = JSON.parse(rawMessages);
        } catch {
            throw new Error(
                'O campo de mensagens da TAG contém um JSON inválido.'
            );
        }
    }
    const version = data.v ?? data.version ?? 3;

    if (
        typeof pointId !== 'string' ||
        !pointId.trim() ||
        !Array.isArray(rawMessages)
    ) {
        console.error('[NFC] Estrutura incompatível:', {
            keys: Object.keys(data),
            version,
            pointId,
            messagesIsArray: Array.isArray(rawMessages),
        });

        throw new Error(
            'Formato de dados NFC inválido. Verifique o conteúdo bruto no Logcat.'
        );
    }

    if (version !== 2 && version !== 3) {
        throw new Error(
            `Versão do protocolo NFC incompatível: ${version}.`
        );
    }

    const messages = rawMessages.map((message: any) =>
        normalizeMessage(message, version)
    );

    console.log('[NFC] Envelope reconhecido:', version);
    console.log('[NFC] Ponto identificado:', pointId);
    console.log('[NFC] Mensagens decodificadas:', messages.length);

    return {
        version,
        pointId,
        messages,
    };
}
