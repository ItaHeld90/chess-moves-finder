import { BoardDBNode, MoveDBNode } from './../types';
import neo4j from 'neo4j-driver';

const CONNECTION_STRING = process.env.NEO4J_CONNECTION_STRING || 'bolt://localhost:7687';

export const driver = neo4j.driver(CONNECTION_STRING);

export async function initGraphDB() {
    const session = driver.session();

    // Create indexes
    await session.run(`CREATE INDEX board_san_index IF NOT EXISTS FOR (b:BOARD) ON (b.san);`);
    await session.run(`CREATE INDEX board_uci_index IF NOT EXISTS FOR (b:BOARD) ON (b.uci);`);

    await session.close();
}

export async function insertBoardToDB(board: BoardDBNode) {
    const session = driver.session();
    await session.run(
        `
        MERGE (b:BOARD { uci: $uci })
        ON CREATE
            SET b = $board;
    `,
        {
            uci: board.uci,
            board,
        }
    );

    await session.close();
}

export async function insertMoveToDB(sourceUci: string, targetUci: string, move: MoveDBNode) {
    const session = driver.session();
    await session.run(
        `
        MATCH (source:BOARD { uci: $sourceUci })
        MATCH (target:BOARD { uci: $targetUci })
        MERGE (source)-[move:MOVE { moveUci: $moveUci }]->(target)
        ON CREATE
            SET move = $move;
    `,
        {
            sourceUci,
            targetUci,
            move,
            moveUci: move.moveUci,
        }
    );

    await session.close();
}
