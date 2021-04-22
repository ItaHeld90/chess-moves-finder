export interface GameStats {
    black: number;
    white: number;
    draws: number;
}

export interface BoardStateDetails extends GameStats {
    moves: MoveDetails[];
}

export interface MoveDetails extends GameStats {
    uci: string;
    san: string;
}

export interface RequestSearchParams {
    fen: string;
    play: string;
}
