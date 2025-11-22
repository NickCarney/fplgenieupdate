-- FPL Database Schema
-- Run this on your SQL Server instance

USE master;
GO

-- Create database if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'FPL')
BEGIN
    CREATE DATABASE FPL;
END;
GO

USE FPL;
GO

-- ============================================
-- TEAMS TABLE
-- ============================================
IF OBJECT_ID('dbo.teams', 'U') IS NOT NULL DROP TABLE dbo.teams;
GO

CREATE TABLE dbo.teams (
    id INT PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    short_name NVARCHAR(10) NOT NULL,
    code INT NOT NULL,
    position INT,
    strength INT,
    strength_overall_home INT,
    strength_overall_away INT,
    strength_attack_home INT,
    strength_attack_away INT,
    strength_defence_home INT,
    strength_defence_away INT,
    pulse_id INT,
    last_updated DATETIME2 DEFAULT GETUTCDATE()
);

CREATE NONCLUSTERED INDEX IX_teams_short_name ON dbo.teams(short_name);
GO

-- ============================================
-- ELEMENT_TYPES TABLE (Positions)
-- ============================================
IF OBJECT_ID('dbo.element_types', 'U') IS NOT NULL DROP TABLE dbo.element_types;
GO

CREATE TABLE dbo.element_types (
    id INT PRIMARY KEY,
    plural_name NVARCHAR(50) NOT NULL,
    plural_name_short NVARCHAR(10) NOT NULL,
    singular_name NVARCHAR(50) NOT NULL,
    singular_name_short NVARCHAR(10) NOT NULL,
    squad_select INT,
    squad_min_play INT,
    squad_max_play INT,
    last_updated DATETIME2 DEFAULT GETUTCDATE()
);
GO

-- ============================================
-- PLAYERS TABLE (Elements)
-- ============================================
IF OBJECT_ID('dbo.players', 'U') IS NOT NULL DROP TABLE dbo.players;
GO

CREATE TABLE dbo.players (
    id INT PRIMARY KEY,
    web_name NVARCHAR(100) NOT NULL,
    first_name NVARCHAR(100),
    second_name NVARCHAR(100),
    team INT NOT NULL,
    element_type INT NOT NULL,
    code INT NOT NULL,

    -- Pricing
    now_cost INT NOT NULL, -- Price in 0.1m (e.g., 100 = 10.0m)
    cost_change_event INT DEFAULT 0,
    cost_change_start INT DEFAULT 0,

    -- Performance stats
    total_points INT DEFAULT 0,
    event_points INT DEFAULT 0,
    form DECIMAL(5,2),
    points_per_game DECIMAL(5,2),
    selected_by_percent DECIMAL(5,2),

    -- Availability
    status NVARCHAR(1), -- 'a' = available, 'd' = doubtful, 'i' = injured, etc.
    news NVARCHAR(MAX),
    news_added DATETIME2,
    chance_of_playing_next_round INT,
    chance_of_playing_this_round INT,

    -- Player stats
    minutes INT DEFAULT 0,
    goals_scored INT DEFAULT 0,
    assists INT DEFAULT 0,
    clean_sheets INT DEFAULT 0,
    goals_conceded INT DEFAULT 0,
    own_goals INT DEFAULT 0,
    penalties_saved INT DEFAULT 0,
    penalties_missed INT DEFAULT 0,
    yellow_cards INT DEFAULT 0,
    red_cards INT DEFAULT 0,
    saves INT DEFAULT 0,
    bonus INT DEFAULT 0,
    bps INT DEFAULT 0, -- Bonus points system

    -- Expected stats
    expected_goals DECIMAL(10,2) DEFAULT 0,
    expected_assists DECIMAL(10,2) DEFAULT 0,
    expected_goal_involvements DECIMAL(10,2) DEFAULT 0,
    expected_goals_conceded DECIMAL(10,2) DEFAULT 0,

    -- Influence/Creativity/Threat
    influence DECIMAL(10,2) DEFAULT 0,
    creativity DECIMAL(10,2) DEFAULT 0,
    threat DECIMAL(10,2) DEFAULT 0,
    ict_index DECIMAL(10,2) DEFAULT 0,

    -- Starts
    starts INT DEFAULT 0,

    -- Influence rank
    influence_rank INT,
    influence_rank_type INT,
    creativity_rank INT,
    creativity_rank_type INT,
    threat_rank INT,
    threat_rank_type INT,
    ict_index_rank INT,
    ict_index_rank_type INT,

    -- Corners and indirect freekicks
    corners_and_indirect_freekicks_order INT,
    corners_and_indirect_freekicks_text NVARCHAR(100),
    direct_freekicks_order INT,
    direct_freekicks_text NVARCHAR(100),
    penalties_order INT,
    penalties_text NVARCHAR(100),

    -- Additional
    in_dreamteam BIT DEFAULT 0,
    dreamteam_count INT DEFAULT 0,
    special BIT DEFAULT 0,

    -- Metadata
    photo NVARCHAR(200),
    last_updated DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT FK_players_team FOREIGN KEY (team) REFERENCES dbo.teams(id),
    CONSTRAINT FK_players_element_type FOREIGN KEY (element_type) REFERENCES dbo.element_types(id)
);

CREATE NONCLUSTERED INDEX IX_players_team ON dbo.players(team);
CREATE NONCLUSTERED INDEX IX_players_element_type ON dbo.players(element_type);
CREATE NONCLUSTERED INDEX IX_players_web_name ON dbo.players(web_name);
CREATE NONCLUSTERED INDEX IX_players_total_points ON dbo.players(total_points DESC);
CREATE NONCLUSTERED INDEX IX_players_now_cost ON dbo.players(now_cost);
GO

-- ============================================
-- EVENTS TABLE (Gameweeks)
-- ============================================
IF OBJECT_ID('dbo.events', 'U') IS NOT NULL DROP TABLE dbo.events;
GO

CREATE TABLE dbo.events (
    id INT PRIMARY KEY,
    name NVARCHAR(50) NOT NULL,
    deadline_time DATETIME2,
    average_entry_score INT,
    finished BIT DEFAULT 0,
    data_checked BIT DEFAULT 0,
    highest_scoring_entry INT,
    highest_score INT,
    is_previous BIT DEFAULT 0,
    is_current BIT DEFAULT 0,
    is_next BIT DEFAULT 0,
    cup_leagues_created BIT DEFAULT 0,
    h2h_ko_matches_created BIT DEFAULT 0,
    chip_plays NVARCHAR(MAX), -- JSON array
    most_selected INT,
    most_transferred_in INT,
    top_element INT,
    top_element_info NVARCHAR(MAX), -- JSON
    transfers_made INT,
    most_captained INT,
    most_vice_captained INT,
    last_updated DATETIME2 DEFAULT GETUTCDATE()
);

CREATE NONCLUSTERED INDEX IX_events_is_current ON dbo.events(is_current) WHERE is_current = 1;
CREATE NONCLUSTERED INDEX IX_events_is_next ON dbo.events(is_next) WHERE is_next = 1;
GO

-- ============================================
-- FIXTURES TABLE
-- ============================================
IF OBJECT_ID('dbo.fixtures', 'U') IS NOT NULL DROP TABLE dbo.fixtures;
GO

CREATE TABLE dbo.fixtures (
    id INT PRIMARY KEY,
    code INT NOT NULL,
    event INT, -- Gameweek (nullable for unscheduled fixtures)
    finished BIT DEFAULT 0,
    finished_provisional BIT DEFAULT 0,
    kickoff_time DATETIME2,
    minutes INT DEFAULT 0,
    provisional_start_time BIT DEFAULT 0,
    started BIT DEFAULT 0,

    -- Teams
    team_a INT NOT NULL,
    team_h INT NOT NULL,

    -- Scores
    team_a_score INT,
    team_h_score INT,

    -- Difficulty ratings
    team_a_difficulty INT,
    team_h_difficulty INT,

    -- Stats (JSON)
    stats NVARCHAR(MAX), -- JSON array of match stats

    -- Pulse ID
    pulse_id INT,

    last_updated DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT FK_fixtures_team_a FOREIGN KEY (team_a) REFERENCES dbo.teams(id),
    CONSTRAINT FK_fixtures_team_h FOREIGN KEY (team_h) REFERENCES dbo.teams(id),
    CONSTRAINT FK_fixtures_event FOREIGN KEY (event) REFERENCES dbo.events(id)
);

CREATE NONCLUSTERED INDEX IX_fixtures_event ON dbo.fixtures(event);
CREATE NONCLUSTERED INDEX IX_fixtures_team_a ON dbo.fixtures(team_a);
CREATE NONCLUSTERED INDEX IX_fixtures_team_h ON dbo.fixtures(team_h);
CREATE NONCLUSTERED INDEX IX_fixtures_kickoff ON dbo.fixtures(kickoff_time);
GO

-- ============================================
-- METADATA TABLE (for tracking updates)
-- ============================================
IF OBJECT_ID('dbo.metadata', 'U') IS NOT NULL DROP TABLE dbo.metadata;
GO

CREATE TABLE dbo.metadata (
    key_name NVARCHAR(100) PRIMARY KEY,
    value_text NVARCHAR(MAX),
    value_int INT,
    value_datetime DATETIME2,
    last_updated DATETIME2 DEFAULT GETUTCDATE()
);

-- Insert initial metadata
MERGE INTO dbo.metadata AS target
USING (VALUES ('last_fpl_update', NULL, NULL, NULL)) AS source (key_name, value_text, value_int, value_datetime)
ON target.key_name = source.key_name
WHEN NOT MATCHED THEN
    INSERT (key_name, value_text, value_int, value_datetime)
    VALUES (source.key_name, source.value_text, source.value_int, source.value_datetime);
GO

PRINT 'Schema created successfully!';
GO
