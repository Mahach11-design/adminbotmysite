import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const ADMIN_ID = Number(process.env.ADMIN_ID);

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const PATH = process.env.FILE_PATH;
const TOKEN = process.env.GITHUB_TOKEN;

// =======================
// STATE
// =======================
const state = {};

// =======================
// LOG
// =======================
const log = (...a) => console.log("[BOT]", ...a);

// =======================
// ADMIN CHECK
// =======================
const isAdmin = (id) => id === ADMIN_ID;

// =======================
// KEYBOARD
// =======================
const menu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "➕ Add", callback_data: "add" }],
            [{ text: "📋 List", callback_data: "list" }]
        ]
    }
};

// =======================
// GITHUB
// =======================
async function getFile() {
    const res = await axios.get(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`,
        { headers: { Authorization: `token ${TOKEN}` } }
    );

    return {
        data: JSON.parse(Buffer.from(res.data.content, "base64").toString()),
        sha: res.data.sha
    };
}

async function updateFile(data, sha) {
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");

    await axios.put(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`,
        {
            message: "update via bot",
            content,
            sha
        },
        { headers: { Authorization: `token ${TOKEN}` } }
    );
}

// =======================
// START
// =======================
bot.onText(/\/start/, (msg) => {
    if (!isAdmin(msg.from.id)) return;

    bot.sendMessage(msg.chat.id, "📦 Admin Panel", menu);
});

// =======================
// CALLBACK
// =======================
bot.on("callback_query", async (q) => {
    try {
        const chatId = q.message?.chat?.id;
        const data = q.data;

        await bot.answerCallbackQuery(q.id).catch(() => {});

        if (!isAdmin(q.from.id)) return;

        log("CLICK:", data);

        // ================= ADD =================
        if (data === "add") {
            state[String(chatId)] = {
                step: "title",
                data: {}
            };

            log("STATE INIT:", state[chatId]);

            return bot.sendMessage(chatId, "📝 ENTER TITLE:");
        }

        // ================= LIST =================
        if (data === "list") {
            const file = await getFile();

            let text = "📋 PROJECTS:\n\n";
            file.data.forEach(p => {
                text += `${p.id} - ${p.title}\n`;
            });

            return bot.sendMessage(chatId, text, menu);
        }

    } catch (e) {
        console.error("[CALLBACK ERROR]", e);
    }
});

// =======================
// MESSAGE FLOW (FIXED)
// =======================
bot.on("message", async (msg) => {
    try {
        const chatId = String(msg.chat.id);
        const text = msg.text;

        if (!isAdmin(msg.from.id)) return;

        const s = state[chatId];

        console.log("[MSG]", text, "STATE:", s);

        if (!s) return;

        // ================= STEP 1: TITLE =================
        if (s.step === "title") {
            s.data.title = text;
            s.step = "short";

            return bot.sendMessage(chatId, "🧾 SHORT DESCRIPTION:");
        }

        // ================= STEP 2: SHORT =================
        if (s.step === "short") {
            s.data.shortDescription = text;
            s.step = "desc";

            return bot.sendMessage(chatId, "📄 DESCRIPTION:");
        }

        // ================= STEP 3: DESCRIPTION =================
        if (s.step === "desc") {
            s.data.description = text;
            s.step = "stack";

            return bot.sendMessage(chatId, "⚙️ STACK (comma separated):");
        }

        // ================= STEP 4: STACK =================
        if (s.step === "stack") {
            s.data.stack = text.split(",").map(x => x.trim());
            s.step = "url";

            return bot.sendMessage(chatId, "🔗 URL:");
        }

        // ================= STEP 5: SAVE =================
        if (s.step === "url") {
            s.data.url = text;

            const file = await getFile();

            file.data.push({
                id: Date.now(),
                status: "in_progress",
                type: "site",
                ...s.data
            });

            await updateFile(file.data, file.sha);

            delete state[chatId];

            log("PROJECT CREATED");

            return bot.sendMessage(chatId, "✅ PROJECT CREATED", menu);
        }

    } catch (e) {
        console.error("[MESSAGE ERROR]", e);
    }
});

// =======================
// GLOBAL ERRORS
// =======================
process.on("uncaughtException", (e) => console.error("[FATAL]", e));
process.on("unhandledRejection", (e) => console.error("[PROMISE]", e));

log("BOT STARTED");
