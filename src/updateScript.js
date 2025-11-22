const sql = require('tedious');
const axios = require('axios');

// Main execution
async function main() {
    console.log('FPL Update script started at:', new Date().toISOString());

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

// Update individual player statistics
async function updatePlayerStats(connection, gameweekData) {
    const { gameweekId, elements } = gameweekData;

    return new Promise((resolve, reject) => {
        let updateCount = 0;
        let errorCount = 0;
        const totalElements = elements.length;

        if (totalElements === 0) {
            console.log('No player data to update');
            resolve();
            return;
        }

        console.log(`Updating ${totalElements} players...`);

        // Process each player
        elements.forEach((element) => {
            const stats = element.stats;

            const query = `
                UPDATE PlayerStats
                SET
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
                    total_points = @total_points
                WHERE player_id = @player_id AND gameweek = @gameweek
            `;

            const request = new sql.Request(query, (err, rowCount) => {
                if (err) {
                    console.error(`Error updating player ${element.id}:`, err.message);
                    errorCount++;
                } else {
                    updateCount++;
                    if (updateCount % 100 === 0) {
                        console.log(`Progress: ${updateCount}/${totalElements} players updated`);
                    }
                }

                // Check if all updates are complete
                if (updateCount + errorCount === totalElements) {
                    console.log(`Update complete: ${updateCount} successful, ${errorCount} errors`);
                    if (errorCount > 0) {
                        reject(new Error(`Failed to update ${errorCount} players`));
                    } else {
                        resolve();
                    }
                }
            });

            request.addParameter('player_id', sql.TYPES.Int, element.id);
            request.addParameter('gameweek', sql.TYPES.Int, gameweekId);
            request.addParameter('minutes', sql.TYPES.Int, stats.minutes);
            request.addParameter('goals_scored', sql.TYPES.Int, stats.goals_scored);
            request.addParameter('assists', sql.TYPES.Int, stats.assists);
            request.addParameter('clean_sheets', sql.TYPES.Int, stats.clean_sheets);
            request.addParameter('goals_conceded', sql.TYPES.Int, stats.goals_conceded);
            request.addParameter('own_goals', sql.TYPES.Int, stats.own_goals);
            request.addParameter('penalties_saved', sql.TYPES.Int, stats.penalties_saved);
            request.addParameter('penalties_missed', sql.TYPES.Int, stats.penalties_missed);
            request.addParameter('yellow_cards', sql.TYPES.Int, stats.yellow_cards);
            request.addParameter('red_cards', sql.TYPES.Int, stats.red_cards);
            request.addParameter('saves', sql.TYPES.Int, stats.saves);
            request.addParameter('bonus', sql.TYPES.Int, stats.bonus);
            request.addParameter('bps', sql.TYPES.Int, stats.bps);
            request.addParameter('influence', sql.TYPES.VarChar, stats.influence);
            request.addParameter('creativity', sql.TYPES.VarChar, stats.creativity);
            request.addParameter('threat', sql.TYPES.VarChar, stats.threat);
            request.addParameter('ict_index', sql.TYPES.VarChar, stats.ict_index);
            request.addParameter('total_points', sql.TYPES.Int, stats.total_points);

            connection.execSql(request);
        });
    });
}

// Run the script
main();
