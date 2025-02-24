const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname)));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'bellovad-secret', // Change this in production
  resave: false,
  saveUninitialized: false
}));

app.get('/game', (req, res) => {
  console.log('GET /game reached - User ID:', req.session.userId);
  if (!req.session.userId) {
    console.log('No user ID - redirecting to login');
    return res.redirect('/');
  }
  db.get('SELECT * FROM games WHERE user_id = ? AND game_name = ?', [req.session.userId, 'market-dominance'], (err, row) => {
    console.log('Game check:', { err, row });
    if (err) {
      console.error('Game check error:', err.message);
      return res.status(500).send('Server error');
    }
    if (row) {
      console.log('Existing game found:', row.game_id);
      return res.sendFile(path.join(__dirname, 'game.html'));
    }
    console.log('No game found, creating new one');
    db.run('INSERT INTO games (user_id, game_name) VALUES (?, ?)', [req.session.userId, 'market-dominance'], function (err) {
      if (err) {
        console.error('Game insert error:', err.message);
        return res.status(500).send('Server error');
      }
      console.log('New game created, ID:', this.lastID);
      const gameId = this.lastID;
      const segments = [
        ['Consumer Basics', 10], ['Industrial Manufacturing', 8], ['Financial Services', 7],
        ['Tech Startups', 6], ['Entertainment Media', 5], ['Luxury Goods', 4], ['Elite Contracts', 3]
      ];
      let stmt = db.prepare('INSERT INTO market (game_id, segment, slots) VALUES (?, ?, ?)');
      segments.forEach(([segment, slots]) => stmt.run(gameId, segment, slots));
      stmt.finalize((err) => {
        if (err) console.error('Market init error:', err.message);
        res.sendFile(path.join(__dirname, 'game.html'));
      });
    });
  });
});
const db = new sqlite3.Database('bellovad.db', (err) => {
  if (err) {
    console.error('Database error:', err.message);
  } else {
    console.log('Connected to SQLite database');
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `, (err) => {
    if (err) console.error('Users table error:', err.message);
    else {
      console.log('Users table ready');
      db.run(`INSERT OR IGNORE INTO users (username, password) VALUES ('test', '1234')`);
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      game_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      game_name TEXT NOT NULL,
      year INTEGER DEFAULT 1,
      quarter INTEGER DEFAULT 1,
      money INTEGER DEFAULT 5,
      loans INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS market (
      market_id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER,
      segment TEXT NOT NULL,
      slots INTEGER NOT NULL,
      tokens INTEGER DEFAULT 0,
      FOREIGN KEY (game_id) REFERENCES games(game_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vps (
      vp_id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER,
      type TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      cubes INTEGER DEFAULT 1,
      FOREIGN KEY (game_id) REFERENCES games(game_id)
    )
  `);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, row) => {
      if (err) {
        console.error('Query error:', err.message);
        res.send('Server error');
      } else if (row) {
        req.session.userId = row.id;
        res.redirect('/dashboard.html');
      } else {
        res.send('Invalid username or password');
      }
    }
  );
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.run(
    'INSERT INTO users (username, password) VALUES (?, ?)',
    [username, password],
    (err) => {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          res.send('Username already taken');
        } else {
          console.error('Insert error:', err.message);
          res.send('Registration failed');
        }
      } else {
        res.redirect('/');
      }
    }
  );
});


app.get('/game-state', (req, res) => {
  if (!req.session.userId) return res.status(401).send('Not logged in');
  db.get(
    'SELECT year, quarter, money FROM games WHERE user_id = ? AND game_name = ?',
    [req.session.userId, 'market-dominance'],
    (err, row) => {
      if (err) return res.status(500).send('Server error');
      if (row) res.json(row);
      else res.status(404).send('Game not found');
    }
  );
});

app.post('/hire-vp', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not logged in' });
  const { vpType } = req.body;
  db.get(
    'SELECT game_id FROM games WHERE user_id = ? AND game_name = ?',
    [req.session.userId, 'market-dominance'],
    (err, row) => {
      if (err || !row) return res.status(500).json({ message: 'Game not found' });
      db.run(
        'INSERT INTO vps (game_id, type) VALUES (?, ?)',
        [row.game_id, vpType],
        (err) => {
          if (err) return res.status(500).json({ message: 'Failed to hire VP' });
          res.json({ message: `Hired ${vpType} VP!` });
        }
      );
    }
  );
});

app.get('/vps', (req, res) => {
  if (!req.session.userId) return res.status(401).json([]);
  db.get('SELECT game_id FROM games WHERE user_id = ? AND game_name = ?', [req.session.userId, 'market-dominance'], (err, row) => {
    if (err || !row) return res.status(500).json([]);
    db.all('SELECT type, level, cubes FROM vps WHERE game_id = ?', [row.game_id], (err, vps) => {
      if (err) return res.status(500).json([]);
      res.json(vps || []);
    });
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

console.log('Server started - testing log');
app.get('/test', (req, res) => {
  console.log('Test route hit');
  res.send('Test works');
});