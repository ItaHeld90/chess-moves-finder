import { driver } from './graph-db/graph-db';
import { staffordGambitPath } from './openings';
import { handleSaveResults } from './save-results';

searchGraph();

async function searchGraph() {
    const session = driver.session();

    const startSan = staffordGambitPath.san?.join(' ') ?? '';

    const results = await session.run(
        `
        MATCH (startBoard:BOARD { san: $startSan })
        MATCH p = (startBoard)-[:MOVE*1..15]->(resultBoard:BOARD)
        WITH startBoard, relationships(p) as moves
        WHERE all(m in moves WHERE m.numGames > 300) AND moves[-1].blackPercentage > 90
        RETURN reduce(sans = split(startBoard.san, " "), m IN moves | sans + m.moveSan) as line;
    `,
        {
            startSan,
        }
    );

    const sans = results.records.map((record) => record.get('line'));

    console.log('results:');
    console.log(sans);

    await session.close();

    await handleSaveResults(sans);
}
