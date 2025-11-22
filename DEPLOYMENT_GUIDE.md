# Quick Deployment Guide

## Files to Copy to Your GitHub Repo

All files are in `/Users/nickcarney/Desktop/fpl/STANDALONE_REPO_FILES/`

### Required Files & Structure:

```
fplgenieupdate/
├── .github/
│   └── workflows/
│       └── update-live-data.yml    # GitHub Actions workflow
├── src/
│   └── updateScript.js             # Main update script
├── .gitignore                      # Git ignore file
├── package.json                    # Node.js dependencies
├── README.md                       # Documentation
└── LICENSE                         # MIT License
```

## Deployment Steps

### 1. Copy Files to Your Cloned Repo

```bash
# Navigate to your cloned repo
cd /path/to/your/cloned/fplgenieupdate

# Copy all files from STANDALONE_REPO_FILES
cp -r /Users/nickcarney/Desktop/fpl/STANDALONE_REPO_FILES/* .
cp /Users/nickcarney/Desktop/fpl/STANDALONE_REPO_FILES/.gitignore .
```

### 2. Push to GitHub

```bash
git add .
git commit -m "Initial commit: FPL live data updater"
git push origin main
```

### 3. Configure GitHub Secrets

Go to: `https://github.com/NickCarney/fplgenieupdate/settings/secrets/actions`

Add these secrets:
- **SQL_SERVER**: `fpl-sql-nc2025.database.windows.net`
- **SQL_DATABASE**: `FPL`
- **SQL_USER**: `sqladmin`
- **SQL_PASSWORD**: `<your-password>`

### 4. Configure Azure SQL Firewall

Azure Portal → SQL Server → Networking:
- ✅ Enable: "Allow Azure services and resources to access this server"

### 5. Test

Go to: `https://github.com/NickCarney/fplgenieupdate/actions`

- Click "Update FPL Live Data"
- Click "Run workflow"
- Watch the logs

## Done!

The script will now run every minute automatically. It will only update the database when games are live.

## Verify It's Working

1. Check Actions tab during a live Premier League game
2. Look for successful runs (green checkmarks)
3. Check your SQL database to see updated PlayerStats
