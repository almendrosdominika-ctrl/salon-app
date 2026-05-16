const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const session = require('express-session');
const Stripe = require('stripe');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

const stripe = Stripe('sk_test_51TSfVFHXPWEiqBNHQkksNKR64uJ85peY0S9Zkn8zT9tiLgD9JIXa6koDs8F4U89tak8E7lak6sGUzsKOwPw2drO400utRV5wKA');

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

// ---------- LOGOWANIE I REJESTRACJA SALONU ----------
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
                <input type="date" id="data" required><br>
                <input type="time" id="godzina" required><br>
                <input type="text" id="usluga" placeholder="Nazwa usługi (np. Piercing ucha)" required><br>
                <input type="number" id="cena" placeholder="Cena (PLN)" required><br>
                <button onclick="dodajTermin()">Dodaj</button>
                <h2>📋 Moje usługi</h2>
<div id="uslugiLista"></div>
<button onclick="pokazFormularzUslugi()">➕ Nowa usługa</button>
<div id="formularzUslugi" style="display:none;">
    <input type="text" id="nazwaUslugi" placeholder="Nazwa usługi"><br>
    <input type="number" id="cenaUslugi" placeholder="Cena (PLN)"><br>
    <input type="number" id="czasUslugi" placeholder="Czas (minuty)"><br>
    <button onclick="dodajUsluge()">Zapisz</button>
    <button onclick="ukryjFormularzUslugi()">Anuluj</button>
</div>
<hr>
                <h2>📋 Moje terminy</h2>
                <div id="terminyLista"></div>
                <h2>📌 Rezerwacje klientów</h2>
                <div id="rezerwacjeLista"></div>
            </div>
         <script>
         async function ladujUslugi() {
    const res = await fetch('/api/uslugi');
    const uslugi = await res.json();
    let html = '<td><thead><tr><th>ID</th><th>Nazwa</th><th>Cena</th><th>Czas (min)</th><th>Akcja</th></tr></thead><tbody>';
    for (let i = 0; i < uslugi.length; i++) {
        const u = uslugi[i];
        html += '<tr>';
        html += '<td>' + u.id + '</td>';
        html += '<td>' + u.nazwa + '</td>';
        html += '<td>' + u.cena + '</td>';
        html += '<td>' + u.czas_trwania_minuty + '</td>';
        html += '<td><button onclick="usunUsluge(' + u.id + ')">Usuń</button></td>';
        html += '</tr>';
    }
    html += '</tbody></tr>';
    document.getElementById('uslugiLista').innerHTML = html;
}

function pokazFormularzUslugi() {
    document.getElementById('formularzUslugi').style.display = 'block';
}
function ukryjFormularzUslugi() {
    document.getElementById('formularzUslugi').style.display = 'none';
}
async function dodajUsluge() {
    const nazwa = document.getElementById('nazwaUslugi').value;
    const cena = document.getElementById('cenaUslugi').value;
    const czas = document.getElementById('czasUslugi').value;
    if (!nazwa || !cena || !czas) { alert('Wypełnij wszystko'); return; }
    const res = await fetch('/api/dodaj-usluge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nazwa, cena: parseInt(cena), czas_trwania_minuty: parseInt(czas) })
    });
    const data = await res.json();
    if (data.success) {
        ladujUslugi();
        ukryjFormularzUslugi();
        document.getElementById('nazwaUslugi').value = '';
        document.getElementById('cenaUslugi').value = '';
        document.getElementById('czasUslugi').value = '';
    } else { alert('Błąd'); }
}
async function usunUsluge(id) {
    if (confirm('Usunąć?')) {
        await fetch('/api/usun-usluge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        ladujUslugi();
    }
}
        async function ladujTerminy() {
        const res = await fetch('/api/terminy-salonu');
        const terminy = await res.json();
        let html = '<table><thead><tr><th>Data</th><th>Godzina</th><th>Usługa</th><th>Cena (PLN)</th><th>Status</th><th>Akcja</th></tr></thead><tbody>';
        if (Array.isArray(terminy) && terminy.length) {
            for (let i = 0; i < terminy.length; i++) {
                const t = terminy[i];
                html += '<tr>';
                html += '<td>' + (t.data || '') + '</td>';
                html += '<td>' + (t.godzina || '') + '</td>';
                html += '<td>' + (t.usluga || '') + '</td>';
                html += '<td>' + (t.cena || 0) + '</td>';
                html += '<td>' + (t.status || '') + '</td>';
                html += '<td>';
                if (t.status === 'wolny') html += '<button onclick="usunTermin(' + t.id + ')">Usuń</button>';
                html += '</td>';
                html += '</tr>';
            }
        } else {
            html += '<tr><td colspan="6">Brak terminów</td></tr>';
        }
        html += '</tbody></table>';
        document.getElementById('terminyLista').innerHTML = html;
    }

       async function ladujRezerwacje() {
        const res = await fetch('/api/rezerwacje-salonu');
        const rezerwacje = await res.json();
        let html = '<table><thead><tr><th>Data</th><th>Godzina</th><th>Klient</th><th>Email</th><th>Akcja</th></tr></thead><tbody>';
        if (Array.isArray(rezerwacje) && rezerwacje.length) {
            for (let i = 0; i < rezerwacje.length; i++) {
                const r = rezerwacje[i];
                html += '<tr>';
                html += '<td>' + (r.data || '') + '</td>';
                html += '<td>' + (r.godzina || '') + '</td>';
                html += '<td>' + (r.klient_nazwa || '') + '</td>';
                html += '<td>' + (r.klient_email || '') + '</td>';
                html += '<td><button class="danger" onclick="anulujRezerwacje(' + r.id + ')">Odmów</button></td>';
                html += '</tr>';
            }
        } else {
            html += '<tr><td colspan="5">Brak rezerwacji</td></tr>';
        }
        html += '</tbody></table>';
        document.getElementById('rezerwacjeLista').innerHTML = html;
    }

    async function dodajTermin() {
        const data = document.getElementById('data').value;
        const godzina = document.getElementById('godzina').value;
        const usluga = document.getElementById('usluga').value;
        const cena = document.getElementById('cena').value;
        if (!data || !godzina || !usluga || !cena) {
            alert('Wypełnij wszystkie pola');
            return;
        }
        await fetch('/api/dodaj-termin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, godzina, usluga, cena })
        });
        ladujTerminy();
        document.getElementById('data').value = '';
        document.getElementById('godzina').value = '';
        document.getElementById('usluga').value = '';
        document.getElementById('cena').value = '';
    }

    async function usunTermin(id) {
        await fetch('/api/usun-termin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        ladujTerminy();
    }

    async function anulujRezerwacje(id) {
        await fetch('/api/anuluj-rezerwacje-salon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        ladujRezerwacje();
        ladujTerminy();
    }

    ladujTerminy();
    ladujRezerwacje();
</script>
        </body>
        </html>
    `);
});
// ---------- USŁUGI ----------
app.get('/api/uslugi', async (req, res) => {
    if (!req.session.salon_id) return res.json([]);
    const { data } = await supabase.from('uslugi').select('*').eq('salon_id', req.session.salon_id);
    res.json(data || []);
});
app.post('/api/dodaj-usluge', async (req, res) => {
    if (!req.session.salon_id) return res.status(401).json({ error: 'Brak sesji' });
    const { nazwa, cena, czas_trwania_minuty } = req.body;
    await supabase.from('uslugi').insert([{ salon_id: req.session.salon_id, nazwa, cena, czas_trwania_minuty, aktywny: true }]);
    res.json({ success: true });
});
app.post('/api/usun-usluge', async (req, res) => {
    const { id } = req.body;
    await supabase.from('uslugi').delete().eq('id', id);
    res.json({ success: true });
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
    const { data, godzina, usluga, cena } = req.body;
    await supabase.from('terminy').insert([{
        salon_id: req.session.salon_id,
        data,
        godzina,
        status: 'wolny',
        usluga: usluga || '',
        cena: parseInt(cena) || 0
    }]);
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

// ---------- NOTATKA (zapis przed płatnością) ----------
app.post('/api/zapisz-notatke', async (req, res) => {
    const { terminId, notatka } = req.body;
    if (!terminId) return res.status(400).json({ error: 'Brak ID terminu' });
    const { error } = await supabase.from('terminy').update({ notatka: notatka || null }).eq('id', terminId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ---------- STRIPE ENDPOINTS ----------
app.post('/api/create-checkout-session', async (req, res) => {
    const { terminId, klientNazwa, klientEmail, kwota, typ, notatka } = req.body;
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'pln',
                    product_data: {
                        name: `Rezerwacja wizyty (${typ === 'zadatek' ? 'zadatek' : 'całość'})`,
                        description: `Termin ID: ${terminId}`
                    },
                    unit_amount: Math.round(kwota * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `https://salon-app-1-r73k.onrender.com/rezerwacje-klient?success=true&terminId=${terminId}&klientNazwa=${encodeURIComponent(klientNazwa)}&klientEmail=${encodeURIComponent(klientEmail)}&kwota=${kwota}&typ=${typ}&notatka=${encodeURIComponent(notatka || '')}`,
            cancel_url: `https://salon-app-1-r73k.onrender.com/rezerwacje-klient?canceled=true`,
        });
        res.json({ url: session.url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/confirm-payment', async (req, res) => {
    const { terminId, klientNazwa, klientEmail, kwota, typ, notatka } = req.body;
    try {
        await supabase.from('terminy').update({ 
            status: 'zajety', 
            klient_nazwa: klientNazwa, 
            klient_email: klientEmail,
            calkowita_kwota: kwota,
            zadatek_oplacony: typ === 'zadatek' ? 1 : 0,
            notatka: notatka || null
        }).eq('id', terminId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
                select, input, button, textarea { width: 100%; padding: 10px; margin: 10px 0; }
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
                    <input type="text" id="klientNazwa" placeholder="Imię i nazwisko" required>
                    <input type="email" id="klientEmail" placeholder="Email" required>
                    <textarea id="notatka" placeholder="Notatka dla salonu (opcjonalnie, max 1000 znaków)" maxlength="1000" rows="4"></textarea>
                    <button type="button" onclick="zapiszNotatke()">💾 Zapisz notatkę</button>
                    <label>Wybierz opcję płatności:</label>
                    <select id="platnoscTyp">
                        <option value="zadatek">Tylko zadatek (20% kwoty)</option>
                        <option value="calkowita">Całość kwoty</option>
                    </select>
                    <input type="hidden" id="wybranaCena">
                    <button onclick="zarezerwujZPlatnoscia()">Przejdź do płatności</button>
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
                        terminy.forEach(t => {
                            html += '<div class="termin" onclick="wybierzTermin(' + t.id + ', ' + (t.cena || 0) + ')">📅 ' + t.data + ' o ' + t.godzina + ' – ' + (t.usluga || 'brak usługi') + ' (' + (t.cena || 0) + ' zł)</div>';
                        });
                    } else {
                        html += '<p>Brak wolnych terminów</p>';
                    }
                    document.getElementById('terminyContainer').innerHTML = html;
                };
                function wybierzTermin(id, cena) {
                    document.getElementById('wybranyTerminId').value = id;
                    document.getElementById('wybranaCena').value = cena;
                    document.getElementById('formularz').style.display = 'block';
                    document.getElementById('formularz').scrollIntoView({ behavior: 'smooth' });
                }
                async function zapiszNotatke() {
                    const terminId = document.getElementById('wybranyTerminId').value;
                    const notatka = document.getElementById('notatka').value;
                    if (!terminId) {
                        alert('Najpierw wybierz termin z listy');
                        return;
                    }
                    const res = await fetch('/api/zapisz-notatke', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ terminId, notatka })
                    });
                    const data = await res.json();
                    if (data.success) {
                        alert('Notatka zapisana!');
                    } else {
                        alert('Błąd: ' + (data.error || 'nieznany błąd'));
                    }
                }
                async function zarezerwujZPlatnoscia() {
                    const terminId = document.getElementById('wybranyTerminId').value;
                    const klientNazwa = document.getElementById('klientNazwa').value;
                    const klientEmail = document.getElementById('klientEmail').value;
                    const platnoscTyp = document.getElementById('platnoscTyp').value;
                    const kwota = parseFloat(document.getElementById('wybranaCena').value);
                    const notatka = document.getElementById('notatka').value;
                    if (!terminId || !klientNazwa || !klientEmail || !kwota) {
                        alert('Wypełnij wszystkie dane lub wybierz termin');
                        return;
                    }
                    const zadatek = platnoscTyp === 'zadatek' ? Math.floor(kwota * 0.2) : kwota;
                    const res = await fetch('/api/create-checkout-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ terminId, klientNazwa, klientEmail, kwota: zadatek, typ: platnoscTyp, notatka })
                    });
                    const data = await res.json();
                    if (data.url) {
                        window.location.href = data.url;
                    } else {
                        alert('Błąd tworzenia sesji płatności');
                    }
                }
                window.onload = function() {
                    const urlParams = new URLSearchParams(window.location.search);
                    if (urlParams.get('success') === 'true') {
                        const terminId = urlParams.get('terminId');
                        const klientNazwa = urlParams.get('klientNazwa');
                        const klientEmail = urlParams.get('klientEmail');
                        const kwota = urlParams.get('kwota');
                        const typ = urlParams.get('typ');
                        const notatka = urlParams.get('notatka');
                        fetch('/api/confirm-payment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ terminId, klientNazwa, klientEmail, kwota, typ, notatka })
                        }).then(() => {
                            alert('Płatność zakończona pomyślnie! Rezerwacja została zapisana.');
                            window.location.href = '/rezerwacje-klient';
                        });
                    } else if (urlParams.get('canceled') === 'true') {
                        alert('Płatność została anulowana.');
                    }
                };
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

// ---------- MOJE REZERWACJE (API) ----------
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
    await supabase.from('terminy').update({ status: 'wolny', klient_nazwa: null, klient_email: null, notatka: null }).eq('id', id);
    res.json({ success: true });
});
app.get('/wyloguj', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(port, '0.0.0.0', () => {
    console.log('Serwer działa na http://localhost:' + port);
});
