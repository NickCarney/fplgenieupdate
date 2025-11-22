const sql = require('tedious');
const axios = require('axios');

// Main execution
async function main() {
    console.log('*** Update script started at:', new Date().toISOString());

    try {
        // Check if any game is currently live
        const isGameLive = await checkIfGameIsLive();

        if (!isGameLive) {
            console.log('No live games. Skipping update.');
            process.exit(0);
        }

        console.log('Live game detected! Updating database...');

        // Get current gameweek data
        const gameweekData = await getCurrentGameweekData();

        // Update database
        await updateDatabase(gameweekData);

        console.log('Database update completed successfully');
        process.exit(0);

    } catch (error) {
        console.error('Error in update script:', error);
        process.exit(1);
    }
}

// Check if any FPL game is currently live
async function checkIfGameIsLive() {
    try {
        const response = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
        const events = response.data.events;

        // Find current gameweek
        const currentGameweek = events.find(event => event.is_current);

        if (!currentGameweek) {
            console.log('No current gameweek found');
            return false;
        }

        console.log(`Current gameweek: ${currentGameweek.id}`);

        // Check if any fixture in current gameweek is live
        const fixturesResponse = await axios.get(`https://fantasy.premierleague.com/api/fixtures/?event=${currentGameweek.id}`);
        const fixtures = fixturesResponse.data;

        // A fixture is live if it has started but not finished
        const liveFixtures = fixtures.filter(fixture =>
            fixture.started === true && fixture.finished === false
        );

        if (liveFixtures.length > 0) {
            console.log(`Found ${liveFixtures.length} live fixture(s)`);
            return true;
        }

        console.log('No live fixtures at this time');
        return false;

    } catch (error) {
        console.error('Error checking if game is live:', error.message);
        throw error;
    }
}

// Get current gameweek data from FPL API
async function getCurrentGameweekData() {
    try {
        const bootstrapResponse = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
        const currentGameweek = bootstrapResponse.data.events.find(event => event.is_current);

        if (!currentGameweek) {
            throw new Error('No current gameweek found');
        }

        console.log(`Fetching live data for gameweek ${currentGameweek.id}...`);

        // Get live gameweek data
        const liveResponse = await axios.get(`https://fantasy.premierleague.com/api/event/${currentGameweek.id}/live/`);

        console.log(`Retrieved data for ${liveResponse.data.elements.length} players`);

        return {
            gameweekId: currentGameweek.id,
            elements: liveResponse.data.elements // Player stats
        };

    } catch (error) {
        console.error('Error fetching gameweek data:', error.message);
        throw error;
    }
}

// Update SQL database with latest player stats
async function updateDatabase(gameweekData) {
    const config = {
        server: process.env.SQL_SERVER,
        authentication: {
            type: 'default',
            options: {
                userName: process.env.SQL_USER,
                password: process.env.SQL_PASSWORD
            }
        },
        options: {
            database: process.env.SQL_DATABASE,
            encrypt: process.env.SQL_ENCRYPT === 'true',
            trustServerCertificate: false,
            connectTimeout: 30000,
            requestTimeout: 30000
        }
    };

    return new Promise((resolve, reject) => {
        const connection = new sql.Connection(config);

        connection.on('connect', (err) => {
            if (err) {
                console.error('Database connection error:', err.message);
                reject(err);
                return;
            }

            console.log('Connected to SQL database');

            // Update player stats
            updatePlayerStats(connection, gameweekData)
                .then(() => {
                    connection.close();
                    resolve();
                })
                .catch((error) => {
                    connection.close();
                    reject(error);
                });
        });

        connection.on('error', (err) => {
            console.error('Connection error:', err.message);
            reject(err);
        });

        connection.connect();
    });
}

// Update individual player statistics in the players table
async function updatePlayerStats(connection, gameweekData) {
    const { gameweekId, elements } = gameweekData;

    if (elements.length === 0) {
        console.log('No player data to update');
        return;
    }

    console.log(`Updating ${elements.length} players...`);

    let updateCount = 0;
    let errorCount = 0;

    // Process players sequentially to avoid overwhelming the connection
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const stats = element.stats;

        try {
            await new Promise((resolve, reject) => {
                const query = `
                    UPDATE dbo.players
                    SET
                        event_points = @event_points,
                        minutes = @minutes,
                        goals_scored = @goals_scored,
                        assists = @assists,
                        clean_sheets = @clean_sheets,
                        goals_conceded = @goals_conceded,
                        own_goals = @own_goals,
                        penalties_saved = @penalties_saved,
                        penalties_missed = @penalties_missed,
                        yellow_cards = @yellow_cards,
                        red_cards = @red_cards,
                        saves = @saves,
                        bonus = @bonus,
                        bps = @bps,
                        influence = @influence,
                        creativity = @creativity,
                        threat = @threat,
                        ict_index = @ict_index,
                        last_updated = GETUTCDATE()
                    WHERE id = @player_id;
                `;

                const request = new sql.Request(connection);

                request.addParameter('player_id', sql.TYPES.Int, element.id);
                request.addParameter('event_points', sql.TYPES.Int, stats.total_points || 0);
                request.addParameter('minutes', sql.TYPES.Int, stats.minutes || 0);
                request.addParameter('goals_scored', sql.TYPES.Int, stats.goals_scored || 0);
                request.addParameter('assists', sql.TYPES.Int, stats.assists || 0);
                request.addParameter('clean_sheets', sql.TYPES.Int, stats.clean_sheets || 0);
                request.addParameter('goals_conceded', sql.TYPES.Int, stats.goals_conceded || 0);
                request.addParameter('own_goals', sql.TYPES.Int, stats.own_goals || 0);
                request.addParameter('penalties_saved', sql.TYPES.Int, stats.penalties_saved || 0);
                request.addParameter('penalties_missed', sql.TYPES.Int, stats.penalties_missed || 0);
                request.addParameter('yellow_cards', sql.TYPES.Int, stats.yellow_cards || 0);
                request.addParameter('red_cards', sql.TYPES.Int, stats.red_cards || 0);
                request.addParameter('saves', sql.TYPES.Int, stats.saves || 0);
                request.addParameter('bonus', sql.TYPES.Int, stats.bonus || 0);
                request.addParameter('bps', sql.TYPES.Int, stats.bps || 0);
                request.addParameter('influence', sql.TYPES.Decimal, parseFloat(stats.influence) || 0);
                request.addParameter('creativity', sql.TYPES.Decimal, parseFloat(stats.creativity) || 0);
                request.addParameter('threat', sql.TYPES.Decimal, parseFloat(stats.threat) || 0);
                request.addParameter('ict_index', sql.TYPES.Decimal, parseFloat(stats.ict_index) || 0);

                request.query(query, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            updateCount++;
            if (updateCount % 100 === 0) {
                console.log(`Progress: ${updateCount}/${elements.length} players updated`);
            }
        } catch (err) {
            console.error(`Error updating player ${element.id}:`, err.message);
            errorCount++;
        }
    }

    console.log(`Update complete: ${updateCount} successful, ${errorCount} errors`);

    if (errorCount > 0) {
        throw new Error(`Failed to update ${errorCount} players`);
    }
}

// Run the script
main();
