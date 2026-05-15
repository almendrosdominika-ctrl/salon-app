// notatki.js - zapis notatki bezpośrednio w bazie
module.exports = (app, supabase) => {
    app.post('/api/zapisz-notatke', async (req, res) => {
        const { terminId, notatka } = req.body;
        if (!terminId) return res.status(400).json({ error: 'Brak ID terminu' });
        const { error } = await supabase.from('terminy').update({ notatka: notatka || null }).eq('id', terminId);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true });
    });
};
