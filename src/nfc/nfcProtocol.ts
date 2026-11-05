
import { Ndef } from 'react-native-nfc-manager';
import { Message, NfcEnvelope } from '../types/Message';
import { MessageCode } from '../constants/messageCatalog';

interface CompactMessageV2 {
    i: string;
    o: string;
    t: number;
    e: number;
    c: MessageCode;
}

interface CompactMessageV3 {
    i: string;
    o: string;
    t: string;
    e: string;
    c: MessageCode;
}

function encodeBase36(value: number): string {
    return value.toString(36);
}

function decodeBase36(value: string): number {
    const decoded = parseInt(value, 36);

    if (!Number.isFinite(decoded)) {
        throw new Error('Timestamp inválido na TAG NFC.');
    }

    return decoded;
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
    console.log('[NFC] Tamanho do JSON:', new TextEncoder().encode(json).length);
    console.log('[NFC] Bytes codificados:', encoded.length);

    return encoded;
}

export function decodeEnvelope(records: any[]): NfcEnvelope | null {
    if (!records || records.length === 0) {
        return null;
    }

    const textRecord = records.find(record =>
        Ndef.isType(
            record,
            Ndef.TNF_WELL_KNOWN,
            Ndef.RTD_TEXT
        )
    );

    if (!textRecord) {
        return null;
    }

    const json = Ndef.text.decodePayload(
        new Uint8Array(textRecord.payload)
    );

    const data = JSON.parse(json);

    if (data.type === 'NFC_POINT') {
        if (typeof data.id !== 'string' || !data.id.trim()) {
            throw new Error('Identificador do ponto NFC inválido.');
        }

        return {
            version: 2,
            pointId: data.id,
            messages: [],
        };
    }

    if (
        typeof data.p !== 'string' ||
        !Array.isArray(data.m)
    ) {
        throw new Error('Formato de dados NFC inválido.');
    }

    let messages: Message[];

    if (data.v === 2) {
        messages = data.m.map((message: CompactMessageV2) => {
            if (
                typeof message.i !== 'string' ||
                typeof message.o !== 'string' ||
                typeof message.t !== 'number' ||
                typeof message.e !== 'number' ||
                typeof message.c !== 'string'
            ) {
                throw new Error('Mensagem v2 armazenada na TAG é inválida.');
            }

            return {
                id: message.i,
                originDevice: message.o,
                createdAt: message.t,
                expiresAt: message.e,
                code: message.c,
            };
        });
    } else if (data.v === 3) {
        messages = data.m.map((message: CompactMessageV3) => {
            if (
                typeof message.i !== 'string' ||
                typeof message.o !== 'string' ||
                typeof message.t !== 'string' ||
                typeof message.e !== 'string' ||
                typeof message.c !== 'string'
            ) {
                throw new Error('Mensagem v3 armazenada na TAG é inválida.');
            }

            return {
                id: message.i,
                originDevice: message.o,
                createdAt: decodeBase36(message.t),
                expiresAt: decodeBase36(message.e),
                code: message.c,
            };
        });
    } else {
        throw new Error('Versão do protocolo NFC incompatível.');
    }

    return {
        version: data.v,
        pointId: data.p,
        messages,
    };
}
