// --- 1. CONFIGURATION ---
const SUPABASE_URL = 'https://tdugfxguucfspbjbolkq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkdWdmeGd1dWNmc3BiamJvbGtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjU5NjgsImV4cCI6MjA4MzMwMTk2OH0.U5hBzvTWJHQ7aXItiESUr7KNOPy0E-i_7p6Qd_gpBHM'; // Replace with your key

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: true
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    const authBtn = document.getElementById('authBtn');
    const submitBtn = document.getElementById('submitBtn');
    const userInput = document.getElementById('userInput');
    const aiResponseDiv = document.getElementById('aiResponse');
    const pastEntriesContainer = document.getElementById('pastEntries');

    // --- 2. AUTHENTICATION HANDLER ---
    const checkUser = async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const user = session?.user;

        if (user) {
            authBtn.innerText = "Logout";
            authBtn.onclick = async () => {
                await supabaseClient.auth.signOut();
                window.location.href = 'index.html';
            };
            // If we are on the journal page, load entries
            if (pastEntriesContainer) loadJournalEntries(user.id);
        } else {
            authBtn.innerText = "Login";
            authBtn.onclick = async () => {
                await supabaseClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: window.location.origin + '/index.html' }
                });
            };
            if (pastEntriesContainer) {
                pastEntriesContainer.innerHTML = "<p style='color:white;'>Please login to see your history.</p>";
            }
        }
    };

    // Listen for auth changes (catches the redirect login)
    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN') checkUser();
    });

    await checkUser();

    // --- 3. GET SUPPORT (AI + SAVE) ---
    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return alert("Please Login first!");

            const text = userInput.value.trim();
            if (!text) return alert("Tell NookAI how you feel.");

            submitBtn.innerText = "NookAI is thinking...";
            submitBtn.disabled = true;

            try {
                // Call the Edge Function
                const { data, error: funcError } = await supabaseClient.functions.invoke('nook-support', {
                    body: { userInput: text }
                });

                if (funcError) throw funcError;

                const advice = data.advice;

                // Save to Database
                await supabaseClient.from('journal_entries').insert([
                    { content: text, affirmation: advice, user_id: user.id }
                ]);

                // Show UI
                aiResponseDiv.style.display = "block";
                aiResponseDiv.innerHTML = `<strong>NookAI:</strong><p>${advice}</p>`;
                userInput.value = "";

            } catch (err) {
                console.error(err);
                alert("Connection lost. Check your Supabase logs!");
            } finally {
                submitBtn.innerText = "Get Support";
                submitBtn.disabled = false;
            }
        });
    }

    // --- 4. LOAD JOURNAL ENTRIES ---
    async function loadJournalEntries(userId) {
        const { data, error } = await supabaseClient
            .from('journal_entries')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (data && data.length > 0) {
            pastEntriesContainer.innerHTML = data.map(e => `
                <div class="entry-item" style="background: rgba(255,255,255,0.2); padding: 20px; border-radius: 20px; margin-bottom: 20px; text-align: left; color: #4b2c6d; border: 1px solid rgba(255,255,255,0.3);">
                    <small><b>${new Date(e.created_at).toLocaleDateString()}</b></small>
                    <p style="margin: 10px 0;"><b>You said:</b> ${e.content}</p>
                    <p style="font-style: italic;"><b>NookAI:</b> ${e.affirmation}</p>
                </div>
            `).join('');
        } else {
            pastEntriesContainer.innerHTML = "<p style='color:white;'>Your Nook is empty. Share your feelings on the home page!</p>";
        }
    }
});