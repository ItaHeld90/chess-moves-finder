import { MovesPath } from './types';

export const italianGamePath: MovesPath = {
    uci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'],
    san: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
};
export const exchangeCaroKannPath: MovesPath = {
    uci: ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4d5', 'c6d5'],
    san: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'],
};
export const knightAttackPath: MovesPath = {
    uci: [...italianGamePath.uci, 'g8f6', 'f3g5'],
    san: [...italianGamePath.san!, 'Nf6', 'Ng5'],
};
export const italianBirdAttack: MovesPath = {
    uci: [...italianGamePath.uci, 'f8c5', 'c2c3', 'g8f6', 'b2b4'],
    san: [...italianGamePath.san!, 'Bc5', 'c3', 'Nf6', 'b4'],
};
export const staffordGambitPath: MovesPath = {
    uci: ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f3e5', 'b8c6', 'e5c6'],
    san: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'Nc6'],
};
export const budapestDefensePath: MovesPath = {
    uci: ['d2d4', 'g8f6', 'c2c4', 'e7e5', 'd4e5', 'f6g4'],
    san: ['d4', 'Nf6', 'c4', 'e5', 'dxe5', 'Ng4'],
};
