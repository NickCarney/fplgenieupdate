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

        // Get all FPL data
        const bootstrapData = await getBootstrapData();
        const gameweekData = await getCurrentGameweekData();
        const fixturesData = await getFixturesData();

        // Validate data before updating
        if (!validateData(bootstrapData, gameweekData, fixturesData)) {
            console.error('Data validation failed. Skipping database update to prevent data corruption.');
            process.exit(1);
        }

        // Update database
        await updateDatabase(bootstrapData, gameweekData, fixturesData);

        console.log('Database update completed successfully');
        process.exit(0);

    } catch (error) {
        console.error('Error in update script:', error);
        process.exit(1);
    }
}

// Validate that all required data is present and valid
function validateData(bootstrapData, gameweekData, fixturesData) {
    console.log('Validating data before database update...');

    // Validate bootstrap data
    if (!bootstrapData) {
        console.error('Bootstrap data is null or undefined');
        return false;
    }

    if (!bootstrapData.teams || !Array.isArray(bootstrapData.teams) || bootstrapData.teams.length === 0) {
        console.error('Invalid or empty teams data');
        return false;
    }

    if (!bootstrapData.elements || !Array.isArray(bootstrapData.elements) || bootstrapData.elements.length === 0) {
        console.error('Invalid or empty players (elements) data');
        return false;
    }

    if (!bootstrapData.events || !Array.isArray(bootstrapData.events) || bootstrapData.events.length === 0) {
        console.error('Invalid or empty events data');
        return false;
    }

    if (!bootstrapData.element_types || !Array.isArray(bootstrapData.element_types) || bootstrapData.element_types.length === 0) {
        console.error('Invalid or empty element_types data');
        return false;
    }

    // Validate gameweek data
    if (!gameweekData) {
        console.error('Gameweek data is null or undefined');
        return false;
    }

    if (!gameweekData.gameweekId || typeof gameweekData.gameweekId !== 'number') {
        console.error('Invalid gameweek ID');
        return false;
    }

    if (!gameweekData.elements || !Array.isArray(gameweekData.elements) || gameweekData.elements.length === 0) {
        console.error('Invalid or empty gameweek elements data');
        return false;
    }

    // Validate fixtures data
    if (!fixturesData || !Array.isArray(fixturesData) || fixturesData.length === 0) {
        console.error('Invalid or empty fixtures data');
        return false;
    }

    // Sanity checks on data quality
    const expectedTeamsCount = 20; // Premier League has 20 teams
    const minPlayersCount = 400; // Should have at least 400 players
    const minEventsCount = 38; // Premier League has 38 gameweeks

    if (bootstrapData.teams.length !== expectedTeamsCount) {
        console.warn(`Warning: Expected ${expectedTeamsCount} teams, but got ${bootstrapData.teams.length}`);
        // Don't fail, just warn as this might be legitimate in off-season
    }

    if (bootstrapData.elements.length < minPlayersCount) {
        console.error(`Invalid player count: Expected at least ${minPlayersCount} players, but got ${bootstrapData.elements.length}`);
        return false;
    }

    if (bootstrapData.events.length < minEventsCount) {
        console.warn(`Warning: Expected ${minEventsCount} events, but got ${bootstrapData.events.length}`);
        // Don't fail, just warn as this might be early season
    }

    console.log('Data validation passed:');
    console.log(`- ${bootstrapData.teams.length} teams`);
    console.log(`- ${bootstrapData.elements.length} players`);
    console.log(`- ${bootstrapData.events.length} events`);
    console.log(`- ${bootstrapData.element_types.length} element types`);
    console.log(`- ${fixturesData.length} fixtures`);
    console.log(`- ${gameweekData.elements.length} live player stats for gameweek ${gameweekData.gameweekId}`);

    return true;
}

// Check if any FPL game is currently live
async function checkIfGameIsLive() {
    try {
        const response = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/', {
            timeout: 30000,
            validateStatus: (status) => status === 200
        });

        if (!response.data || !response.data.events) {
            throw new Error('Bootstrap API returned invalid events data');
        }

        const events = response.data.events;

        // Find current gameweek
        const currentGameweek = events.find(event => event.is_current);

        if (!currentGameweek) {
            console.log('No current gameweek found');
            return false;
        }

        console.log(`Current gameweek: ${currentGameweek.id}`);

        // Check if any fixture in current gameweek is live
        const fixturesResponse = await axios.get(`https://fantasy.premierleague.com/api/fixtures/?event=${currentGameweek.id}`, {
            timeout: 30000,
            validateStatus: (status) => status === 200
        });

        if (!fixturesResponse.data || !Array.isArray(fixturesResponse.data)) {
            throw new Error('Fixtures API returned invalid data');
        }

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
        if (error.response) {
            console.error(`API returned status ${error.response.status}: ${error.response.statusText}`);
        }
        throw error;
    }
}

// Get bootstrap static data (teams, players, events)
async function getBootstrapData() {
    try {
        console.log('Fetching bootstrap data...');
        const response = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/', {
            timeout: 30000,
            validateStatus: (status) => status === 200 // Only accept 200 as valid
        });

        if (!response.data) {
            throw new Error('Bootstrap API returned empty response');
        }

        console.log(`Retrieved ${response.data.teams?.length || 0} teams, ${response.data.elements?.length || 0} players, ${response.data.events?.length || 0} events`);
        return response.data;
    } catch (error) {
        console.error('Error fetching bootstrap data:', error.message);
        if (error.response) {
            console.error(`API returned status ${error.response.status}: ${error.response.statusText}`);
        }
        throw error;
    }
}

// Get current gameweek data from FPL API
async function getCurrentGameweekData() {
    try {
        const bootstrapResponse = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/', {
            timeout: 30000,
            validateStatus: (status) => status === 200
        });

        if (!bootstrapResponse.data || !bootstrapResponse.data.events) {
            throw new Error('Bootstrap API returned invalid events data');
        }

        const currentGameweek = bootstrapResponse.data.events.find(event => event.is_current);

        if (!currentGameweek) {
            throw new Error('No current gameweek found');
        }

        console.log(`Fetching live data for gameweek ${currentGameweek.id}...`);

        // Get live gameweek data
        const liveResponse = await axios.get(`https://fantasy.premierleague.com/api/event/${currentGameweek.id}/live/`, {
            timeout: 30000,
            validateStatus: (status) => status === 200
        });

        if (!liveResponse.data || !liveResponse.data.elements) {
            throw new Error('Live API returned invalid player data');
        }

        console.log(`Retrieved live stats for ${liveResponse.data.elements.length} players`);

        return {
            gameweekId: currentGameweek.id,
            elements: liveResponse.data.elements // Player stats
        };

    } catch (error) {
        console.error('Error fetching gameweek data:', error.message);
        if (error.response) {
            console.error(`API returned status ${error.response.status}: ${error.response.statusText}`);
        }
        throw error;
    }
}

// Get fixtures data
async function getFixturesData() {
    try {
        console.log('Fetching fixtures data...');
        const response = await axios.get('https://fantasy.premierleague.com/api/fixtures/', {
            timeout: 30000,
            validateStatus: (status) => status === 200
        });

        if (!response.data || !Array.isArray(response.data)) {
            throw new Error('Fixtures API returned invalid data');
        }

        console.log(`Retrieved ${response.data.length} fixtures`);
        return response.data;
    } catch (error) {
        console.error('Error fetching fixtures data:', error.message);
        if (error.response) {
            console.error(`API returned status ${error.response.status}: ${error.response.statusText}`);
        }
        throw error;
    }
}

// Update SQL database with all FPL data
async function updateDatabase(bootstrapData, gameweekData, fixturesData) {
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
            requestTimeout: 60000 // Increased timeout for multiple updates
        }
    };

    return new Promise((resolve, reject) => {
        const connection = new sql.Connection(config);

        connection.on('connect', async (err) => {
            if (err) {
                console.error('Database connection error:', err.message);
                reject(err);
                return;
            }

            console.log('Connected to SQL database');

            try {
                // Update all tables in sequence
                await updateTeams(connection, bootstrapData.teams);
                await updateElementTypes(connection, bootstrapData.element_types);
                await updateEvents(connection, bootstrapData.events);
                await updateFixtures(connection, fixturesData);
                await updatePlayers(connection, bootstrapData.elements);
                await updatePlayerStats(connection, gameweekData);

                connection.close();
                resolve();
            } catch (error) {
                connection.close();
                reject(error);
            }
        });

        connection.on('error', (err) => {
            console.error('Connection error:', err.message);
            reject(err);
        });

        connection.connect();
    });
}

// Update teams table
async function updateTeams(connection, teams) {
    console.log(`Updating ${teams.length} teams...`);
    let updateCount = 0;

    for (const team of teams) {
        await new Promise((resolve, reject) => {
            const query = `
                MERGE dbo.teams AS target
                USING (SELECT @id AS id) AS source
                ON target.id = source.id
                WHEN MATCHED THEN
                    UPDATE SET
                        name = @name,
                        short_name = @short_name,
                        code = @code,
                        position = @position,
                        strength = @strength,
                        strength_overall_home = @strength_overall_home,
                        strength_overall_away = @strength_overall_away,
                        strength_attack_home = @strength_attack_home,
                        strength_attack_away = @strength_attack_away,
                        strength_defence_home = @strength_defence_home,
                        strength_defence_away = @strength_defence_away,
                        pulse_id = @pulse_id,
                        last_updated = GETUTCDATE()
                WHEN NOT MATCHED THEN
                    INSERT (id, name, short_name, code, position, strength, strength_overall_home, strength_overall_away,
                            strength_attack_home, strength_attack_away, strength_defence_home, strength_defence_away, pulse_id)
                    VALUES (@id, @name, @short_name, @code, @position, @strength, @strength_overall_home, @strength_overall_away,
                            @strength_attack_home, @strength_attack_away, @strength_defence_home, @strength_defence_away, @pulse_id);
            `;

            const request = new sql.Request(query, (err) => {
                if (err) reject(err);
                else resolve();
            });

            request.addParameter('id', sql.TYPES.Int, team.id);
            request.addParameter('name', sql.TYPES.NVarChar, team.name);
            request.addParameter('short_name', sql.TYPES.NVarChar, team.short_name);
            request.addParameter('code', sql.TYPES.Int, team.code);
            request.addParameter('position', sql.TYPES.Int, team.position || null);
            request.addParameter('strength', sql.TYPES.Int, team.strength || null);
            request.addParameter('strength_overall_home', sql.TYPES.Int, team.strength_overall_home || null);
            request.addParameter('strength_overall_away', sql.TYPES.Int, team.strength_overall_away || null);
            request.addParameter('strength_attack_home', sql.TYPES.Int, team.strength_attack_home || null);
            request.addParameter('strength_attack_away', sql.TYPES.Int, team.strength_attack_away || null);
            request.addParameter('strength_defence_home', sql.TYPES.Int, team.strength_defence_home || null);
            request.addParameter('strength_defence_away', sql.TYPES.Int, team.strength_defence_away || null);
            request.addParameter('pulse_id', sql.TYPES.Int, team.pulse_id || null);

            connection.execSql(request);
        });
        updateCount++;
    }
    console.log(`Teams updated: ${updateCount}`);
}

// Update element_types (positions) table
async function updateElementTypes(connection, elementTypes) {
    console.log(`Updating ${elementTypes.length} element types...`);
    let updateCount = 0;

    for (const type of elementTypes) {
        await new Promise((resolve, reject) => {
            const query = `
                MERGE dbo.element_types AS target
                USING (SELECT @id AS id) AS source
                ON target.id = source.id
                WHEN MATCHED THEN
                    UPDATE SET
                        plural_name = @plural_name,
                        plural_name_short = @plural_name_short,
                        singular_name = @singular_name,
                        singular_name_short = @singular_name_short,
                        squad_select = @squad_select,
                        squad_min_play = @squad_min_play,
                        squad_max_play = @squad_max_play,
                        last_updated = GETUTCDATE()
                WHEN NOT MATCHED THEN
                    INSERT (id, plural_name, plural_name_short, singular_name, singular_name_short,
                            squad_select, squad_min_play, squad_max_play)
                    VALUES (@id, @plural_name, @plural_name_short, @singular_name, @singular_name_short,
                            @squad_select, @squad_min_play, @squad_max_play);
            `;

            const request = new sql.Request(query, (err) => {
                if (err) reject(err);
                else resolve();
            });

            request.addParameter('id', sql.TYPES.Int, type.id);
            request.addParameter('plural_name', sql.TYPES.NVarChar, type.plural_name);
            request.addParameter('plural_name_short', sql.TYPES.NVarChar, type.plural_name_short);
            request.addParameter('singular_name', sql.TYPES.NVarChar, type.singular_name);
            request.addParameter('singular_name_short', sql.TYPES.NVarChar, type.singular_name_short);
            request.addParameter('squad_select', sql.TYPES.Int, type.squad_select || null);
            request.addParameter('squad_min_play', sql.TYPES.Int, type.squad_min_play || null);
            request.addParameter('squad_max_play', sql.TYPES.Int, type.squad_max_play || null);

            connection.execSql(request);
        });
        updateCount++;
    }
    console.log(`Element types updated: ${updateCount}`);
}

// Update events (gameweeks) table
async function updateEvents(connection, events) {
    console.log(`Updating ${events.length} events...`);
    let updateCount = 0;

    for (const event of events) {
        await new Promise((resolve, reject) => {
            const query = `
                MERGE dbo.events AS target
                USING (SELECT @id AS id) AS source
                ON target.id = source.id
                WHEN MATCHED THEN
                    UPDATE SET
                        name = @name,
                        deadline_time = @deadline_time,
                        average_entry_score = @average_entry_score,
                        finished = @finished,
                        data_checked = @data_checked,
                        highest_scoring_entry = @highest_scoring_entry,
                        highest_score = @highest_score,
                        is_previous = @is_previous,
                        is_current = @is_current,
                        is_next = @is_next,
                        most_selected = @most_selected,
                        most_transferred_in = @most_transferred_in,
                        top_element = @top_element,
                        transfers_made = @transfers_made,
                        most_captained = @most_captained,
                        most_vice_captained = @most_vice_captained,
                        last_updated = GETUTCDATE()
                WHEN NOT MATCHED THEN
                    INSERT (id, name, deadline_time, average_entry_score, finished, data_checked, highest_scoring_entry, highest_score,
                            is_previous, is_current, is_next, most_selected, most_transferred_in, top_element, transfers_made,
                            most_captained, most_vice_captained)
                    VALUES (@id, @name, @deadline_time, @average_entry_score, @finished, @data_checked, @highest_scoring_entry, @highest_score,
                            @is_previous, @is_current, @is_next, @most_selected, @most_transferred_in, @top_element, @transfers_made,
                            @most_captained, @most_vice_captained);
            `;

            const request = new sql.Request(query, (err) => {
                if (err) reject(err);
                else resolve();
            });

            request.addParameter('id', sql.TYPES.Int, event.id);
            request.addParameter('name', sql.TYPES.NVarChar, event.name);
            request.addParameter('deadline_time', sql.TYPES.DateTime2, event.deadline_time ? new Date(event.deadline_time) : null);
            request.addParameter('average_entry_score', sql.TYPES.Int, event.average_entry_score || null);
            request.addParameter('finished', sql.TYPES.Bit, event.finished || false);
            request.addParameter('data_checked', sql.TYPES.Bit, event.data_checked || false);
            request.addParameter('highest_scoring_entry', sql.TYPES.Int, event.highest_scoring_entry || null);
            request.addParameter('highest_score', sql.TYPES.Int, event.highest_score || null);
            request.addParameter('is_previous', sql.TYPES.Bit, event.is_previous || false);
            request.addParameter('is_current', sql.TYPES.Bit, event.is_current || false);
            request.addParameter('is_next', sql.TYPES.Bit, event.is_next || false);
            request.addParameter('most_selected', sql.TYPES.Int, event.most_selected || null);
            request.addParameter('most_transferred_in', sql.TYPES.Int, event.most_transferred_in || null);
            request.addParameter('top_element', sql.TYPES.Int, event.top_element || null);
            request.addParameter('transfers_made', sql.TYPES.Int, event.transfers_made || null);
            request.addParameter('most_captained', sql.TYPES.Int, event.most_captained || null);
            request.addParameter('most_vice_captained', sql.TYPES.Int, event.most_vice_captained || null);

            connection.execSql(request);
        });
        updateCount++;
    }
    console.log(`Events updated: ${updateCount}`);
}

// Update fixtures table
async function updateFixtures(connection, fixtures) {
    console.log(`Updating ${fixtures.length} fixtures...`);
    let updateCount = 0;

    for (const fixture of fixtures) {
        await new Promise((resolve, reject) => {
            const query = `
                MERGE dbo.fixtures AS target
                USING (SELECT @id AS id) AS source
                ON target.id = source.id
                WHEN MATCHED THEN
                    UPDATE SET
                        code = @code,
                        event = @event,
                        finished = @finished,
                        finished_provisional = @finished_provisional,
                        kickoff_time = @kickoff_time,
                        minutes = @minutes,
                        started = @started,
                        team_a = @team_a,
                        team_h = @team_h,
                        team_a_score = @team_a_score,
                        team_h_score = @team_h_score,
                        team_a_difficulty = @team_a_difficulty,
                        team_h_difficulty = @team_h_difficulty,
                        pulse_id = @pulse_id,
                        last_updated = GETUTCDATE()
                WHEN NOT MATCHED THEN
                    INSERT (id, code, event, finished, finished_provisional, kickoff_time, minutes, started,
                            team_a, team_h, team_a_score, team_h_score, team_a_difficulty, team_h_difficulty, pulse_id)
                    VALUES (@id, @code, @event, @finished, @finished_provisional, @kickoff_time, @minutes, @started,
                            @team_a, @team_h, @team_a_score, @team_h_score, @team_a_difficulty, @team_h_difficulty, @pulse_id);
            `;

            const request = new sql.Request(query, (err) => {
                if (err) reject(err);
                else resolve();
            });

            request.addParameter('id', sql.TYPES.Int, fixture.id);
            request.addParameter('code', sql.TYPES.Int, fixture.code);
            request.addParameter('event', sql.TYPES.Int, fixture.event || null);
            request.addParameter('finished', sql.TYPES.Bit, fixture.finished || false);
            request.addParameter('finished_provisional', sql.TYPES.Bit, fixture.finished_provisional || false);
            request.addParameter('kickoff_time', sql.TYPES.DateTime2, fixture.kickoff_time ? new Date(fixture.kickoff_time) : null);
            request.addParameter('minutes', sql.TYPES.Int, fixture.minutes || 0);
            request.addParameter('started', sql.TYPES.Bit, fixture.started || false);
            request.addParameter('team_a', sql.TYPES.Int, fixture.team_a);
            request.addParameter('team_h', sql.TYPES.Int, fixture.team_h);
            request.addParameter('team_a_score', sql.TYPES.Int, fixture.team_a_score || null);
            request.addParameter('team_h_score', sql.TYPES.Int, fixture.team_h_score || null);
            request.addParameter('team_a_difficulty', sql.TYPES.Int, fixture.team_a_difficulty || null);
            request.addParameter('team_h_difficulty', sql.TYPES.Int, fixture.team_h_difficulty || null);
            request.addParameter('pulse_id', sql.TYPES.Int, fixture.pulse_id || null);

            connection.execSql(request);
        });
        updateCount++;
    }
    console.log(`Fixtures updated: ${updateCount}`);
}

// Update players table (from bootstrap data)
async function updatePlayers(connection, players) {
    console.log(`Updating ${players.length} players (bootstrap data)...`);
    let updateCount = 0;

    for (const player of players) {
        await new Promise((resolve, reject) => {
            const query = `
                MERGE dbo.players AS target
                USING (SELECT @id AS id) AS source
                ON target.id = source.id
                WHEN MATCHED THEN
                    UPDATE SET
                        web_name = @web_name,
                        first_name = @first_name,
                        second_name = @second_name,
                        team = @team,
                        element_type = @element_type,
                        now_cost = @now_cost,
                        total_points = @total_points,
                        form = @form,
                        points_per_game = @points_per_game,
                        selected_by_percent = @selected_by_percent,
                        status = @status,
                        last_updated = GETUTCDATE()
                WHEN NOT MATCHED THEN
                    INSERT (id, web_name, first_name, second_name, team, element_type, code, now_cost, total_points,
                            form, points_per_game, selected_by_percent, status)
                    VALUES (@id, @web_name, @first_name, @second_name, @team, @element_type, @code, @now_cost, @total_points,
                            @form, @points_per_game, @selected_by_percent, @status);
            `;

            const request = new sql.Request(query, (err) => {
                if (err) reject(err);
                else resolve();
            });

            request.addParameter('id', sql.TYPES.Int, player.id);
            request.addParameter('web_name', sql.TYPES.NVarChar, player.web_name);
            request.addParameter('first_name', sql.TYPES.NVarChar, player.first_name || null);
            request.addParameter('second_name', sql.TYPES.NVarChar, player.second_name || null);
            request.addParameter('team', sql.TYPES.Int, player.team);
            request.addParameter('element_type', sql.TYPES.Int, player.element_type);
            request.addParameter('code', sql.TYPES.Int, player.code);
            request.addParameter('now_cost', sql.TYPES.Int, player.now_cost);
            request.addParameter('total_points', sql.TYPES.Int, player.total_points || 0);
            request.addParameter('form', sql.TYPES.Decimal, parseFloat(player.form) || null);
            request.addParameter('points_per_game', sql.TYPES.Decimal, parseFloat(player.points_per_game) || null);
            request.addParameter('selected_by_percent', sql.TYPES.Decimal, parseFloat(player.selected_by_percent) || null);
            request.addParameter('status', sql.TYPES.NVarChar, player.status || 'a');

            connection.execSql(request);
        });
        updateCount++;
        if (updateCount % 100 === 0) {
            console.log(`Progress: ${updateCount}/${players.length} players updated`);
        }
    }
    console.log(`Players updated: ${updateCount}`);
}

// Update individual player statistics in the players table (live data)
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

                const request = new sql.Request(query, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });

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

                connection.execSql(request);
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
