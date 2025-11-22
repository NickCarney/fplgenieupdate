const sql = require('tedious');

// Verify database connection and check for required tables
async function initDatabase() {
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

            // Verify the players table exists
            const checkTableQuery = `
                IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[players]') AND type in (N'U'))
                BEGIN
                    SELECT 'Database ready: players table found' AS Message;
                END
                ELSE
                BEGIN
                    SELECT 'ERROR: players table not found. Please run the schema.sql file first.' AS Message;
                END
            `;

            const request = new sql.Request(checkTableQuery, (err) => {
                if (err) {
                    console.error('Query error:', err.message);
                    connection.close();
                    reject(err);
                    return;
                }
                connection.close();
                resolve();
            });

            request.on('row', (columns) => {
                const message = columns[0].value;
                console.log(message);
                if (message.startsWith('ERROR')) {
                    reject(new Error(message));
                }
            });

            connection.execSql(request);
        });

        connection.on('error', (err) => {
            console.error('Connection error:', err.message);
            reject(err);
        });

        connection.connect();
    });
}

// Run the initialization
initDatabase()
    .then(() => {
        console.log('Database initialization check completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Database initialization failed:', error);
        process.exit(1);
    });
