import { MessageCode } from '../constants/messageCatalog';


export interface Message {
    id: string;
    originDevice: string;
    createdAt: number;
    expiresAt: number;
    code: MessageCode;
    deliveredAt?: number | null;
}


export interface NfcEnvelope {
    version: number;
    pointId: string;
    messages: Message[];
}