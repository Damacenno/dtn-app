export const MESSAGE_CATALOG = [
    { code: '001', label: 'Solicitação de ajuda' },
    { code: '002', label: 'Necessidade de água' },
    { code: '003', label: 'Pessoa ferida' },
    { code: '004', label: 'Necessidade de alimentos' },
    { code: '005', label: 'Local seguro' },
    { code: '006', label: 'Necessidade de evacuação' },
    { code: '007', label: 'Solicitação de medicamentos' },
    { code: '008', label: 'Perigo identificado' },
] as const;

export type MessageCode = typeof MESSAGE_CATALOG[number]['code'];

export function getMessageLabel(code: string): string {
    return MESSAGE_CATALOG.find(message => message.code === code)?.label
        ?? 'Mensagem desconhecida';
}