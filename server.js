const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

const db = new sqlite3.Database('salon.db');

// Tabele
db.run(`CREATE TABLE IF NOT EXISTS salony (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nazwa TEXT,
    email TEXT UNIQUE,
    haslo TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS terminy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    salon_id INTEGER,
    data TEXT,
    godzina TEXT,
    klient_nazwa TEXT,
    klient_email TEXT,
    status TEXT DEFAULT 'wolny'
)`);

// Strona główna
app.get('/', (req, res) => {
    res.send(`
        <h1>✨ SalonApp ✨</h1>
        <a href="/login-panel">🔐 Panel salonu</a><br>
        <a href="/rezerwacje-klient">📅 Rezerwuj wizytę</a>
    `);
});

// ========== PANEL SALONU ==========

app.get('/login-panel', (req, res) => {
    res.send(`
        <html>
        <head><title>Logowanie</title>
        <style>
            body { font-family: Arial; background: #667eea; padding: 50px; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            input { width: 100%; padding: 10px; margin: 10px 0; }
            button { background: #667eea; color: white; padding: 10px; width: 100%; border: none; border-radius: 5px; cursor: pointer; }
        </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 Logowanie salonu</h1>
                <form method="post" action="/login-panel">
                    <input type="email" name="email" placeholder="Email" required>
                    <input type="password" name="haslo" placeholder="Hasło" required>
                    <button type="submit">Zaloguj</button>
                </form>
                <a href="/rejestracja-salonu">Zarejestruj salon</a>
            </div>
        </body>
        </html>
    `);
});

app.post('/login-panel', (req, res) => {
    const { email, haslo } = req.body;
    db.get(`SELECT * FROM salony WHERE email = ?`, [email], async (err, salon) => {
        if (!salon || !(await bcrypt.compare(haslo, salon.haslo))) {
            res.send("Błędny email lub hasło <a href='/login-panel'>Spróbuj ponownie</a>");
        } else {
            req.session.salon_id = salon.id;
            req.session.salon_nazwa = salon.nazwa;
            res.redirect('/panel');
        }
    });
});

app.get('/rejestracja-salonu', (req, res) => {
    res.send(`
        <html>
        <head><title>Rejestracja</title>
        <style>
            body { font-family: Arial; background: #667eea; padding: 50px; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            input { width: 100%; padding: 10px; margin: 10px 0; }
            button { background: #667eea; color: white; padding: 10px; width: 100%; border: none; border-radius: 5px; cursor: pointer; }
        </style>
        </head>
        <body>
            <div class="container">
                <h1>📝 Rejestracja salonu</h1>
                <form method="post" action="/rejestracja-salonu">
                    <input type="text" name="nazwa" placeholder="Nazwa salonu" required>
                    <input type="email" name="email" placeholder="Email" required>
                    <input type="password" name="haslo" placeholder="Hasło" required>
                    <button type="submit">Zarejestruj</button>
                </form>
                <a href="/login-panel">Masz już konto? Zaloguj się</a>
            </div>
        </body>
        </html>
    `);
});

app.post('/rejestracja-salonu', async (req, res) => {
    const { nazwa, email, haslo } = req.body;
    const hash = await bcrypt.hash(haslo, 10);
    db.run(`INSERT INTO salony (nazwa, email, haslo) VALUES (?, ?, ?)`, [nazwa, email, hash], (err) => {
        if (err) res.send("Błąd: email już istnieje <a href='/rejestracja-salonu'>Spróbuj ponownie</a>");
        else res.send("Rejestracja udana! <a href='/login-panel'>Zaloguj się</a>");
    });
});

// Panel salonu
app.get('/panel', (req, res) => {
    if (!req.session.salon_id) return res.redirect('/login-panel');
    
    res.send(`
        <html>
        <head>
            <title>Panel salonu</title>
            <style>
                body { font-family: Arial; background: #f5f5f5; padding: 20px; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; }
                input, button { padding: 10px; margin: 5px; }
                button { background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; }
                .danger { background: #e74c3c; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📅 ${req.session.salon_nazwa}</h1>
                <a href="/wyloguj">Wyloguj</a>
                
                <h2>➕ Dodaj termin</h2>
                <input type="date" id="data">
                <input type="time" id="godzina">
                <button onclick="dodajTermin()">Dodaj</button>
                
                <h2>📋 Moje terminy</h2>
                <div id="terminyLista"></div>
                
                <h2>📌 Rezerwacje klientów</h2>
                <div id="rezerwacjeLista"></div>
            </div>
            <script>
                function ladujTerminy() {
                    fetch('/api/terminy-salonu')
                        .then(res => res.json())
                        .then(terminy => {
                            let html = '<table><thead><tr><th>Data</th><th>Godzina</th><th>Status</th><th>Akcja</th></tr></thead><tbody>';
                            terminy.forEach(t => {
                                html += '<tr><td>' + t.data + '</td><td>' + t.godzina + '</td><td>' + t.status + '</td><td>';
                                if(t.status === 'wolny') html += '<button onclick="usunTermin(' + t.id + ')">Usuń</button>';
                                html += '</td></tr>';
                            });
                            html += '</tbody></table>';
                            document.getElementById('terminyLista').innerHTML = html;
                        });
                }
                
                function ladujRezerwacje() {
                    fetch('/api/rezerwacje-salonu')
                        .then(res => res.json())
                        .then(rezerwacje => {
                            let html = '<table><thead><tr><th>Data</th><th>Godzina</th><th>Klient</th><th>Email</th><th>Akcja</th></tr></thead><tbody>';
                            rezerwacje.forEach(r => {
                                html += '<tr><td>' + r.data + '</td><td>' + r.godzina + '</td><td>' + r.klient_nazwa + '</td><td>' + r.klient_email + '</td><td><button class="danger" onclick="anulujRezerwacje(' + r.id + ')">Odmów</button></td></tr>';
                            });
                            html += '</tbody></table>';
                            document.getElementById('rezerwacjeLista').innerHTML = html;
                        });
                }
                
                function dodajTermin() {
                    const data = document.getElementById('data').value;
                    const godzina = document.getElementById('godzina').value;
                    fetch('/api/dodaj-termin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data, godzina })
                    }).then(() => { ladujTerminy(); });
                }
                
                function usunTermin(id) {
                    fetch('/api/usun-termin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id })
                    }).then(() => { ladujTerminy(); });
                }
                
                function anulujRezerwacje(id) {
                    fetch('/api/anuluj-rezerwacje-salon', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id })
                    }).then(() => { ladujRezerwacje(); ladujTerminy(); });
                }
                
                ladujTerminy();
                ladujRezerwacje();
            </script>
        </body>
        </html>
    `);
});

// API dla salonu
app.get('/api/terminy-salonu', (req, res) => {
    if (!req.session.salon_id) return res.json([]);
    db.all(`SELECT * FROM terminy WHERE salon_id = ? ORDER BY data, godzina`, [req.session.salon_id], (err, rows) => {
        res.json(rows);
    });
});

app.get('/api/rezerwacje-salonu', (req, res) => {
    if (!req.session.salon_id) return res.json([]);
    db.all(`SELECT * FROM terminy WHERE salon_id = ? AND status = 'zajety' ORDER BY data, godzina`, [req.session.salon_id], (err, rows) => {
        res.json(rows);
    });
});

app.post('/api/dodaj-termin', (req, res) => {
    const { data, godzina } = req.body;
    db.run(`INSERT INTO terminy (salon_id, data, godzina, status) VALUES (?, ?, ?, 'wolny')`, [req.session.salon_id, data, godzina], () => {
        res.json({ success: true });
    });
});

app.post('/api/usun-termin', (req, res) => {
    const { id } = req.body;
    db.run(`DELETE FROM terminy WHERE id = ?`, [id], () => {
        res.json({ success: true });
    });
});

app.post('/api/anuluj-rezerwacje-salon', (req, res) => {
    const { id } = req.body;
    db.run(`UPDATE terminy SET status = 'wolny', klient_nazwa = NULL, klient_email = NULL WHERE id = ?`, [id], () => {
        res.json({ success: true });
    });
});

// ========== STRONA KLIENTA Z ZEGAREM ODLICZAJĄCYM ==========

app.get('/rezerwacje-klient', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Rezerwacja wizyty</title>
            <style>
                body { font-family: Arial; background: #667eea; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; }
                select, input, button { width: 100%; padding: 10px; margin: 10px 0; }
                button { background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; }
                .termin { background: #f0f0f0; padding: 10px; margin: 5px; border-radius: 5px; cursor: pointer; display: inline-block; }
                .rezerwacja-item { border-left: 4px solid #667eea; padding: 10px; margin: 10px 0; background: #f9f9f9; }
                .odliczanie { font-size: 20px; font-weight: bold; color: #e74c3c; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📅 Rezerwacja wizyty</h1>
                <select id="salonSelect">
                    <option value="">Wybierz salon...</option>
                </select>
                <div id="terminyContainer"></div>
                <div id="formularz" style="display:none;">
                    <h3>Twoje dane</h3>
                    <input type="hidden" id="wybranyTerminId">
                    <input type="text" id="klientNazwa" placeholder="Imię i nazwisko">
                    <input type="email" id="klientEmail" placeholder="Email">
                    <button onclick="zarezerwuj()">Potwierdź</button>
                </div>
                
                <hr>
                <h2>📋 Moje rezerwacje</h2>
                <input type="email" id="emailSprawdz" placeholder="Wpisz swój email">
                <button onclick="pokażRezerwacje()">Pokaż</button>
                <div id="mojeRezerwacje"></div>
            </div>
            <script>
                fetch('/api/salony')
                    .then(res => res.json())
                    .then(salony => {
                        const select = document.getElementById('salonSelect');
                        salony.forEach(s => {
                            select.innerHTML += '<option value="' + s.id + '">' + s.nazwa + '</option>';
                        });
                    });
                
                document.getElementById('salonSelect').onchange = function() {
                    const salonId = this.value;
                    fetch('/api/wolne-terminy?salon_id=' + salonId)
                        .then(res => res.json())
                        .then(terminy => {
                            let html = '<h3>Dostępne terminy:</h3>';
                            terminy.forEach(t => {
                                html += '<div class="termin" onclick="wybierzTermin(' + t.id + ')">📅 ' + t.data + ' o ' + t.godzina + '</div>';
                            });
                            document.getElementById('terminyContainer').innerHTML = html;
                        });
                };
                
                function wybierzTermin(id) {
                    document.getElementById('wybranyTerminId').value = id;
                    document.getElementById('formularz').style.display = 'block';
                }
                
                function zarezerwuj() {
                    const data = {
                        terminId: document.getElementById('wybranyTerminId').value,
                        klientNazwa: document.getElementById('klientNazwa').value,
                        klientEmail: document.getElementById('klientEmail').value
                    };
                    fetch('/api/zarezerwuj', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    }).then(() => {
                        alert('Zarezerwowano!');
                        location.reload();
                    });
                }
                
                function startCountdown(data, godzina, id) {
                    // Poprawne parsowanie daty YYYY-MM-DD
                    let target = new Date(data + 'T' + godzina);
                    
                    function update() {
                        let now = new Date();
                        let diff = target - now;
                        
                        if(diff <= 0) {
                            let el = document.getElementById('odliczanie-' + id);
                            if(el) el.innerHTML = '✅ Termin minął';
                            return;
                        }
                        
                        let days = Math.floor(diff / (1000 * 60 * 60 * 24));
                        let hours = Math.floor((diff % (86400000)) / (1000 * 60 * 60));
                        let minutes = Math.floor((diff % (3600000)) / (1000 * 60));
                        let seconds = Math.floor((diff % (60000)) / 1000);
                        
                        let txt = '';
                        if(days > 0) txt += days + 'd ';
                        txt += hours + 'h ' + minutes + 'm ' + seconds + 's';
                        
                        let el = document.getElementById('odliczanie-' + id);
                        if(el) el.innerHTML = '⏰ Do wizyty: ' + txt;
                    }
                    
                    update();
                    setInterval(update, 1000);
                }
                
                function pokażRezerwacje() {
                    const email = document.getElementById('emailSprawdz').value;
                    if(!email) { alert('Wpisz email'); return; }
                    
                    fetch('/api/moje-rezerwacje?email=' + encodeURIComponent(email))
                        .then(res => res.json())
                        .then(lista => {
                            if(lista.length === 0) {
                                document.getElementById('mojeRezerwacje').innerHTML = '<p>Brak rezerwacji</p>';
                                return;
                            }
                            
                            let html = '';
                            lista.forEach(r => {
                                html += '<div class="rezerwacja-item" id="r-' + r.id + '">';
                                html += '<strong>' + r.salon_nazwa + '</strong><br>';
                                html += '📅 ' + r.data + ' o ' + r.godzina + '<br>';
                                html += '👤 ' + r.klient_nazwa + '<br>';
                                html += '<div id="odliczanie-' + r.id + '" class="odliczanie">⏰ Obliczanie...</div>';
                                html += '<button onclick="anuluj(' + r.id + ')">❌ Anuluj</button>';
                                html += '</div>';
                            });
                            document.getElementById('mojeRezerwacje').innerHTML = html;
                            
                            lista.forEach(r => {
                                let targetDate = new Date(r.data + 'T' + r.godzina);
                                let now = new Date();
                                if(targetDate > now) {
                                    startCountdown(r.data, r.godzina, r.id);
                                } else {
                                    let el = document.getElementById('odliczanie-' + r.id);
                                    if(el) el.innerHTML = '✅ Termin minął';
                                }
                            });
                        });
                }
                
                function anuluj(id) {
                    if(confirm('Anulować rezerwację?')) {
                        fetch('/api/anuluj-rezerwacje-klient', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id })
                        }).then(() => {
                            alert('Anulowano');
                            pokażRezerwacje();
                        });
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// API dla klienta
app.get('/api/salony', (req, res) => {
    db.all(`SELECT id, nazwa FROM salony`, (err, rows) => {
        res.json(rows);
    });
});

app.get('/api/wolne-terminy', (req, res) => {
    const { salon_id } = req.query;
    db.all(`SELECT * FROM terminy WHERE salon_id = ? AND status = 'wolny' ORDER BY data, godzina`, [salon_id], (err, rows) => {
        res.json(rows);
    });
});

app.post('/api/zarezerwuj', (req, res) => {
    const { terminId, klientNazwa, klientEmail } = req.body;
    db.run(`UPDATE terminy SET status = 'zajety', klient_nazwa = ?, klient_email = ? WHERE id = ?`, 
        [klientNazwa, klientEmail, terminId], () => {
        res.json({ success: true });
    });
});

app.get('/api/moje-rezerwacje', (req, res) => {
    const { email } = req.query;
    db.all(`
        SELECT t.*, s.nazwa as salon_nazwa 
        FROM terminy t 
        JOIN salony s ON t.salon_id = s.id 
        WHERE t.klient_email = ? AND t.status = 'zajety'
        ORDER BY t.data, t.godzina
    `, [email], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/anuluj-rezerwacje-klient', (req, res) => {
    const { id } = req.body;
    db.run(`UPDATE terminy SET status = 'wolny', klient_nazwa = NULL, klient_email = NULL WHERE id = ?`, [id], () => {
        res.json({ success: true });
    });
});

app.get('/wyloguj', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(port, () => {
    console.log('Serwer działa na http://localhost:' + port);
});
