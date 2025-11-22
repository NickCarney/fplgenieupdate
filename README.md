# FPL Genie Live Data Updater

Automated system that updates your SQL database with live Fantasy Premier League data every 5 minutes during active games.

## Features

- **Smart Scheduling**: Runs every 5 minutes via GitHub Actions
- **Live Game Detection**: Only updates when FPL fixtures are actually in progress
- **Efficient**: Skips updates when no games are live to save resources
- **Free**: Uses GitHub Actions (unlimited minutes for public repos)
- **Automatic**: No manual intervention needed once set up

## How It Works

1. GitHub Actions triggers the script every 5 minutes
2. Script checks FPL API for the current gameweek
3. Checks if any fixtures are live (started but not finished)
4. If no live games → exits immediately (no database update)
5. If live games detected → fetches live player stats from FPL API
6. Updates `dbo.players` table in your SQL database with live stats

## Prerequisites

- SQL Server database with FPL schema (see `database/schema.sql`)
- GitHub account (for GitHub Actions)
- SQL Server firewall configured to allow GitHub Actions connections

## Quick Setup

### 1. Clone this repository

```bash
git clone https://github.com/YourUsername/fplgenieupdate.git
cd fplgenieupdate
```

### 2. Configure GitHub Secrets

Go to your repository settings → Secrets and variables → Actions → New repository secret

Add these four secrets:

| Secret Name | Value |
|------------|-------|
| `SQL_SERVER` | `fpl-sql-nc2025.database.windows.net` |
| `SQL_DATABASE` | `FPL` |
| `SQL_USER` | `sqladmin` |
| `SQL_PASSWORD` | Your SQL password |

### 3. Configure Azure SQL Firewall

In Azure Portal:
1. Navigate to your SQL Server (fpl-sql-nc2025)
2. Go to "Networking" or "Firewalls and virtual networks"
3. Enable: **"Allow Azure services and resources to access this server"**
4. Save

### 4. Enable GitHub Actions

1. Go to the "Actions" tab in your GitHub repository
2. If prompted, enable Actions for this repository
3. The workflow "Update FPL Live Data" should appear
4. It will run automatically every minute

### 5. Test It

**Manual trigger:**
1. Go to Actions tab
2. Click "Update FPL Live Data" workflow
3. Click "Run workflow" → "Run workflow"
4. Watch the logs to see it in action

**Check logs:**
- Click on any workflow run to see detailed logs
- Green checkmark = success
- Red X = failure (check logs for errors)

## Database Schema

The script uses your existing FPL database schema. Run the `database/schema.sql` file to create:

- `teams` - Premier League teams
- `players` - All FPL players (this is what gets updated)
- `events` - Gameweeks
- `fixtures` - Match fixtures
- `metadata` - Tracking information

### What Gets Updated

During live games, these fields in the `dbo.players` table are updated:

- `event_points` - Current gameweek points
- `minutes`, `goals_scored`, `assists`, `clean_sheets`
- `goals_conceded`, `own_goals`, `penalties_saved/missed`
- `yellow_cards`, `red_cards`, `saves`
- `bonus`, `bps` (Bonus points system)
- `influence`, `creativity`, `threat`, `ict_index`
- `last_updated` timestamp

## Local Testing

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables

Create a `.env` file (not committed to git):

```env
SQL_SERVER=fpl-sql-nc2025.database.windows.net
SQL_DATABASE=FPL
SQL_USER=sqladmin
SQL_PASSWORD=your_password_here
SQL_ENCRYPT=true
```

### 3. Run the script

```bash
npm start
```

Or directly:

```bash
node src/updateScript.js
```

## Monitoring

### GitHub Actions Logs
- Go to Actions tab → Click on any run
- View real-time logs
- See which players were updated
- Check for any errors

### What to expect:
- **No live games**: Script exits quickly with "No live games" message
- **Live games**: Updates all players, shows progress every 100 players
- **Success**: Exit code 0, green checkmark
- **Failure**: Exit code 1, red X with error details

## Troubleshooting

### "No live games" every time
- Check if games are actually happening (Premier League schedule)
- Verify FPL API is accessible: https://fantasy.premierleague.com/api/bootstrap-static/

### Database connection errors
- Verify GitHub Secrets are set correctly
- Check Azure SQL Server firewall allows Azure services
- Confirm SQL credentials are correct
- Test connection from Azure Portal Query Editor

### "Failed to update X players"
- Check `dbo.players` table exists (run `database/schema.sql`)
- Verify database schema is set up correctly
- Run `npm run init-db` to verify database connection

### GitHub Actions not running
- Check if Actions are enabled for your repository
- Verify the workflow file is in `.github/workflows/` directory
- Check if repository is active (not archived)

## Cost

**FREE!** GitHub provides unlimited Action minutes for public repositories.

For private repositories: 2,000 free minutes/month (more than enough for this use case).

## Schedule

The workflow runs every 5 minutes: `*/5 * * * *`

**Note**: GitHub Actions scheduled workflows may have a slight delay (1-5 minutes) during high-load times, but this shouldn't affect functionality since games last 90+ minutes.

## Contributing

Feel free to open issues or submit pull requests!

## License

MIT
