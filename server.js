const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24,
        sameSite: 'lax'
    }
}));

app.get('/ping', (req, res) => res.send('pong'));

const supabaseUrl = 'https://mzikoowaictyhtxawmkm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16aWtvb3dhaWN0eWh0eGF3bWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1OTU2MjIsImV4cCI6MjA5MzE3MTYyMn0.XPUMq7CXL6J_-gBU1vwSgdOTvB1C8SkwdyzKrNvqzFo';
const supabase = createClient(supabaseUrl, supabaseKey);

app.get('/', (req, res) => {
    res.send('<h1>SalonApp działa!</h1><a href="/login-panel">Panel salonu</a><br><a href="/rezerwacje-klient">Rezerwuj wizytę</a>');
});

// ---------- LOGOWANIE I REJESTRACJA ----------
app.get('/login-panel', (req, res) => {
    res.send(`
        <form method="post" action="/login-panel">
            Email: <input name="email"><br>
            Hasło: <input type="password" name="haslo"><br>
            <button>Zaloguj</button>
        </form>
        <a href="/rejestracja-salonu">Rejestracja</a>
    `);
});

app.post('/login-panel', async (req, res) => {
    const { email, haslo } = req.body;
    const { data: salon } = await supabase
        .from('salony')
        .select('*')
        .eq('email', email)
        .single();

    if (!salon || !(await bcrypt.compare(haslo, salon.haslo))) {
        res.send("Błąd logowania <a href='/login-panel'>Spróbuj ponownie</a>");
    } else {
        req.session.salon_id = salon.id;
        req.session.salon_nazwa = salon.nazwa;
        res.redirect('/panel');
    }
});

app.get('/rejestracja-salonu', (req, res) => {
    res.send(`
        <form method="post" action="/rejestracja-salonu">
            Nazwa: <input name="nazwa"><br>
            Email: <input name="email"><br>
            Hasło: <input type="password" name="haslo"><br>
            <button>Zarejestruj</button>
        </form>
    `);
});

app.post('/rejestracja-salonu', async (req, res) => {
    const { nazwa, email, haslo } = req.body;
    const hash = await bcrypt.hash(haslo, 10);
    const { error } = await supabase.from('salony').insert([{ nazwa, email, haslo: hash }]);
    if (error) {
        res.send("Błąd rejestracji (email może istnieć) <a href='/rejestracja-salonu'>Spróbuj ponownie</a>");
    } else {
        res.redirect('/login-panel');
    }
});

// ---------- PANEL SALONU ----------
app.get('/panel', (req, res) => {
    if (!req.session.salon_id) return res.redirect('/login-panel');

    res.send(`
        <!DOCTYPE html>
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
                <h1>📅 Panel zarządzania</h1>
                <a href="/wyloguj">Wyloguj</a>
                <h2>➕ Dodaj termin</h2>
                <input type="date" id="data"><input type="time" id="godzina"><button onclick="dodajTermin()">Dodaj</button>
                <h2>📋 Moje terminy</h2>
                <div id="terminyLista"></div>
                <h2>📌 Rezerwacje klientów</h2>
                <div id="rezerwacjeLista"></div>
            </div>
            <script>
                async function ladujTerminy() {
                    const res = await fetch('/api/terminy-salonu');
                    const terminy = await res.json();
                    let html = '<table><thead><tr><th>Data</th><th>Godzina</th><th>Status</th><th>Akcja</th></tr></thead><tbody>';
                    if (Array.isArray(terminy) && terminy.length) {
                        terminy.forEach(t => {
                            html += '<tr><td>' + (t.data || '') + '</td><td>' + (t.godzina || '') + '</td><td>' + (t.status || '') + '</td><td>';
                            if(t.status === 'wolny') html += '<button onclick="usunTermin(' + t.id + ')">Usuń</button>';
                            html += 'NonNullable';
                        });
                    } else {
                        html += '<tr><td colspan="4">Brak terminów</td></tr>';
                    }
                    html += '</tbody></tr>';
                    document.getElementById('terminyLista').innerHTML = html;
                }
                async function ladujRezerwacje() {
                    const res = await fetch('/api/rezerwacje-salonu');
                    const rezerwacje = await res.json();
                    let html = '</table><thead><tr><th>Data</th><th>Godzina</th><th>Klient</th><th>Email</th><th>Akcja</th></tr></thead><tbody>';
                    if (Array.isArray(rezerwacje) && rezerwacje.length) {
                        rezerwacje.forEach(r => {
                            html += '<tr><td>' + (r.data || '') + '</td><td>' + (r.godzina || '') + '<tr><td>' + (r.klient_nazwa || '') + '</td><td>' + (r.klient_email || '') + '</td><td><button class="danger" onclick="anulujRezerwacje(' + r.id + ')">Odmów</button>NonNullable';
                        });
                    } else {
                        html += '<tr><td colspan="5">Brak rezerwacji</td></tr>';
                    }
                    html += '</tbody></table>';
                    document.getElementById('rezerwacjeLista').innerHTML = html;
                }
                async function dodajTermin() {
                    const data = document.getElementById('data').value;
                    const godzina = document.getElementById('godzina').value;
                    await fetch('/api/dodaj-termin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, godzina }) });
                    ladujTerminy();
                }
                async function usunTermin(id) {
                    await fetch('/api/usun-termin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
                    ladujTerminy();
                }
                async function anulujRezerwacje(id) {
                    await fetch('/api/anuluj-rezerwacje-salon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
                    ladujRezerwacje(); ladujTerminy();
                }
                ladujTerminy(); ladujRezerwacje();
            </script>
        </body>
        </html>
    `);
});

// ---------- API SALONU ----------
app.get('/api/terminy-salonu', async (req, res) => {
    if (!req.session.salon_id) return res.json([]);
    const { data } = await supabase.from('terminy').select('*').eq('salon_id', req.session.salon_id).order('data', { ascending: true });
    res.json(data || []);
});

app.get('/api/rezerwacje-salonu', async (req, res) => {
    if (!req.session.salon_id) return res.json([]);
    const { data } = await supabase.from('terminy').select('*').eq('salon_id', req.session.salon_id).eq('status', 'zajety').order('data', { ascending: true });
    res.json(data || []);
});

app.post('/api/dodaj-termin', async (req, res) => {
    const { data, godzina } = req.body;
    await supabase.from('terminy').insert([{ salon_id: req.session.salon_id, data, godzina, status: 'wolny' }]);
    res.json({ success: true });
});

app.post('/api/usun-termin', async (req, res) => {
    const { id } = req.body;
    await supabase.from('terminy').delete().eq('id', id);
    res.json({ success: true });
});

app.post('/api/anuluj-rezerwacje-salon', async (req, res) => {
    const { id } = req.body;
    await supabase.from('terminy').update({ status: 'wolny', klient_nazwa: null, klient_email: null }).eq('id', id);
    res.json({ success: true });
});

// ---------- API KLIENTA ----------
app.get('/api/salony', async (req, res) => {
    const { data } = await supabase.from('salony').select('id, nazwa');
    res.json(data || []);
});

app.get('/api/wolne-terminy', async (req, res) => {
    const { salon_id } = req.query;
    const { data } = await supabase.from('terminy').select('*').eq('salon_id', salon_id).eq('status', 'wolny').order('data', { ascending: true });
    res.json(data || []);
});

app.post('/api/zarezerwuj', async (req, res) => {
    const { terminId, klientNazwa, klientEmail } = req.body;
    await supabase.from('terminy').update({ status: 'zajety', klient_nazwa: klientNazwa, klient_email: klientEmail }).eq('id', terminId);
    res.json({ success: true });
});

app.get('/api/moje-rezerwacje', async (req, res) => {
    const { email } = req.query;
    const { data } = await supabase.from('terminy').select('*, salony(nazwa)').eq('klient_email', email).eq('status', 'zajety').order('data', { ascending: true });
    const wynik = (data || []).map(item => ({
        id: item.id,
        data: item.data,
        godzina: item.godzina,
        klient_nazwa: item.klient_nazwa,
        nazwa_salonu: item.salony?.nazwa || 'Salon'
    }));
    res.json(wynik);
});

app.post('/api/anuluj-rezerwacje-klient', async (req, res) => {
    const { id } = req.body;
    await supabase.from('terminy').update({ status: 'wolny', klient_nazwa: null, klient_email: null }).eq('id', id);
    res.json({ success: true });
});

// ---------- STRONA REZERWACJI KLIENTA ----------
app.get('/rezerwacje-klient', async (req, res) => {
    const { data: salony } = await supabase.from('salony').select('id, nazwa');
    let listaSalonow = '<option value="">Wybierz salon...</option>';
    if (salony && salony.length) {
        salony.forEach(s => { listaSalonow += `<option value="${s.id}">${s.nazwa}</option>`; });
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
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
                <select id="salonSelect">${listaSalonow}</select>
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
                document.getElementById('salonSelect').onchange = async function() {
                    const salonId = this.value;
                    if(!salonId) return;
                    const res = await fetch('/api/wolne-terminy?salon_id=' + salonId);
                    const terminy = await res.json();
                    let html = '<h3>Dostępne terminy:</h3>';
                    if (Array.isArray(terminy) && terminy.length) {
                        terminy.forEach(t => { html += '<div class="termin" onclick="wybierzTermin(' + t.id + ')">📅 ' + t.data + ' o ' + t.godzina + '</div>'; });
                    } else {
                        html += '<p>Brak wolnych terminów</p>';
                    }
                    document.getElementById('terminyContainer').innerHTML = html;
                };
                function wybierzTermin(id) { document.getElementById('wybranyTerminId').value = id; document.getElementById('formularz').style.display = 'block'; }
                async function zarezerwuj() {
                    const data = {
                        terminId: document.getElementById('wybranyTerminId').value,
                        klientNazwa: document.getElementById('klientNazwa').value,
                        klientEmail: document.getElementById('klientEmail').value
                    };
                    await fetch('/api/zarezerwuj', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                    alert('Zarezerwowano!'); location.reload();
                }
                function startCountdown(data, godzina, id) {
                    let target = new Date(data + 'T' + godzina);
                    setInterval(() => {
                        let diff = target - new Date();
                        if(diff <= 0) { document.getElementById('odliczanie-' + id).innerHTML = '⏰ Termin minął'; return; }
                        let days = Math.floor(diff / 86400000);
                        let hours = Math.floor((diff % 86400000) / 3600000);
                        let mins = Math.floor((diff % 3600000) / 60000);
                        let secs = Math.floor((diff % 60000) / 1000);
                        let txt = (days ? days + 'd ' : '') + hours + 'h ' + mins + 'm ' + secs + 's';
                        document.getElementById('odliczanie-' + id).innerHTML = '⏰ Do wizyty: ' + txt;
                    }, 1000);
                }
                async function pokażRezerwacje() {
                    const email = document.getElementById('emailSprawdz').value;
                    if(!email) { alert('Wpisz email'); return; }
                    const res = await fetch('/api/moje-rezerwacje?email=' + encodeURIComponent(email));
                    const lista = await res.json();
                    let html = '';
                    if (Array.isArray(lista) && lista.length) {
                        lista.forEach(r => {
                            html += '<div class="rezerwacja-item" id="r-' + r.id + '"><strong>' + r.nazwa_salonu + '</strong><br>';
                            html += '📅 ' + r.data + ' o ' + r.godzina + '<br>👤 ' + r.klient_nazwa + '<br>';
                            html += '<div id="odliczanie-' + r.id + '" class="odliczanie">⏰ Obliczanie...</div>';
                            html += '<button onclick="anuluj(' + r.id + ')">❌ Anuluj</button></div>';
                        });
                    } else {
                        html = '<p>Brak rezerwacji</p>';
                    }
                    document.getElementById('mojeRezerwacje').innerHTML = html;
                    if (Array.isArray(lista) && lista.length) {
                        lista.forEach(r => { if(new Date(r.data + 'T' + r.godzina) > new Date()) startCountdown(r.data, r.godzina, r.id); else document.getElementById('odliczanie-' + r.id).innerHTML = '⏰ Termin minął'; });
                    }
                }
                async function anuluj(id) {
                    if(confirm('Anulować rezerwację?')) {
                        await fetch('/api/anuluj-rezerwacje-klient', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
                        alert('Anulowano'); pokażRezerwacje();
                    }
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/wyloguj', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(port, '0.0.0.0', () => {
    console.log('Serwer działa na http://localhost:' + port);
});
