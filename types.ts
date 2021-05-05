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

export interface MoveDecisionData {
    id: string;
    path: MovesPath;
    toMove: 'white' | 'black';
    numGames: number;
    probablity: number;
    cumulativeProbability: number;
    whitePercentage: number;
    blackPercentage: number;
    drawPercentage: number;
    depth: number;
    prevMoveData?: MoveDecisionData;
    alternativeMovesData?: MoveDecisionData[];
}

export interface RunnerState {
    millis: number;
    isArtificiallyStopped: boolean;
    recordedPaths: RecordedPath[];
    numExpandedMoves: number;
}

export interface RunnerParams {
    startingPath: MovesPath;
    shouldExpand: (move: MoveDecisionData) => boolean;
    shouldRecord: (move: MoveDecisionData) => boolean;
    shouldStop?: (runnerState: RunnerState) => boolean;
}

export interface MovesPath {
    uci: string[];
    san?: string[];
}

export interface RecordedPath {
    path: MovesPath;
    decisionData: MoveDecisionData;
}

export interface BoardDBNode {
    uci: string;
    black: number;
    white: number;
    draws: number;
}
