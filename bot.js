import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

// =======================
// EXPRESS (FIX RENDER)
// =======================
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Bot is running");
});

app.listen(PORT, () => {
    console.log("HTTP server running on", PORT);
});

// =======================
// TELEGRAM
// =======================
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const ADMIN_ID = Number(process.env.ADMIN_ID);
const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const PATH = process.env.FILE_PATH;
const TOKEN = process.env.GITHUB_TOKEN;

const state = {};

const log = (...a) => console.log("[BOT]", ...a);
const isAdmin = (id) => id === ADMIN_ID;

// =======================
// UI
// =======================
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "➕ Add", callback_data: "add" }],
            [{ text: "📋 List", callback_data: "list" }],
            [{ text: "✏️ Edit", callback_data: "edit_menu" }],
            [{ text: "🗑 Delete", callback_data: "delete_menu" }]
        ]
    }
};

const backCancel = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "⬅️ Back", callback_data: "add_back" }],
            [{ text: "❌ Cancel", callback_data: "cancel" }]
        ]
    }
};

const confirmKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "✅ Save", callback_data: "add_confirm" }],
            [{ text: "⬅️ Back", callback_data: "add_back" }],
            [{ text: "❌ Cancel", callback_data: "cancel" }]
        ]
    }
};

// =======================
// GITHUB API
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
    bot.sendMessage(msg.chat.id, "📦 Admin Panel", mainMenu);
});

// =======================
// CALLBACK
// =======================
bot.on("callback_query", async (q) => {
    try {
        const chatId = q.message.chat.id;
        const data = q.data;

        await bot.answerCallbackQuery(q.id).catch(() => {});
        if (!isAdmin(q.from.id)) return;

        log("CLICK:", data);

        // ===== LIST =====
        if (data === "list") {
            const file = await getFile();
            let text = "📋 PROJECTS:\n\n";
            file.data.forEach(p => {
                text += `🆔 ${p.id}\n📌 ${p.title}\n⚡ ${p.status}\n\n`;
            });
            return bot.sendMessage(chatId, text, mainMenu);
        }

        // ===== DELETE =====
        if (data === "delete_menu") {
            const file = await getFile();
            const buttons = file.data.map(p => ([{
                text: `❌ ${p.title}`,
                callback_data: `del_${p.id}`
            }]));
            return bot.sendMessage(chatId, "Select project:", {
                reply_markup: { inline_keyboard: buttons }
            });
        }

        if (data.startsWith("del_")) {
            const id = Number(data.split("_")[1]);
            const file = await getFile();
            file.data = file.data.filter(p => p.id !== id);
            await updateFile(file.data, file.sha);
            return bot.sendMessage(chatId, "🗑 Deleted", mainMenu);
        }

        // ===== EDIT =====
        if (data === "edit_menu") {
            const file = await getFile();
            const buttons = file.data.map(p => ([{
                text: `✏️ ${p.title}`,
                callback_data: `edit_${p.id}`
            }]));
            return bot.sendMessage(chatId, "Pick project:", {
                reply_markup: { inline_keyboard: buttons }
            });
        }

        if (data.startsWith("edit_")) {
            const id = Number(data.split("_")[1]);
            state[chatId] = { mode: "edit", id };
            return bot.sendMessage(chatId, "Send new TITLE:");
        }

        // ===== ADD START =====
        if (data === "add") {
            state[chatId] = {
                mode: "add",
                step: "title",
                data: {}
            };
            return bot.sendMessage(chatId, "📝 Enter TITLE:", backCancel);
        }

        // ===== NAV =====
        if (data === "cancel") {
            delete state[chatId];
            return bot.sendMessage(chatId, "❌ Cancelled", mainMenu);
        }

        if (data === "add_back") {
            const s = state[chatId];
            if (!s) return;

            if (s.step === "status") {
                s.step = "type";
                return bot.sendMessage(chatId, "Select TYPE:");
            }

            if (s.step === "preview") {
                s.step = "status";
                return bot.sendMessage(chatId, "Select STATUS:");
            }

            if (s.step === "type") {
                s.step = "url";
                return bot.sendMessage(chatId, "🔗 URL:");
            }

            if (s.step === "url") {
                s.step = "stack";
                return bot.sendMessage(chatId, "⚙️ Stack:");
            }

            if (s.step === "stack") {
                s.step = "desc";
                return bot.sendMessage(chatId, "📄 Description:");
            }

            if (s.step === "desc") {
                s.step = "short";
                return bot.sendMessage(chatId, "🧾 Short:");
            }

            if (s.step === "short") {
                s.step = "title";
                return bot.sendMessage(chatId, "📝 Title:");
            }
        }

        // ===== TYPE =====
        if (data.startsWith("add_type_")) {
            const val = data.replace("add_type_", "");
            state[chatId].data.type = val;
            state[chatId].step = "status";

            return bot.sendMessage(chatId, "Select STATUS:", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🟡 In progress", callback_data: "add_status_in_progress" }],
                        [{ text: "🟢 Done", callback_data: "add_status_done" }],
                        [{ text: "⚪ Not started", callback_data: "add_status_not_started" }]
                    ]
                }
            });
        }

        // ===== STATUS =====
        if (data.startsWith("add_status_")) {
            const val = data.replace("add_status_", "");
            state[chatId].data.status = val;
            state[chatId].step = "preview";

            const d = state[chatId].data;

            return bot.sendMessage(chatId,
`📦 Preview:

📌 ${d.title}
🧾 ${d.shortDescription}
📄 ${d.description}
⚙️ ${d.stack.join(", ")}
🔗 ${d.url}
🏷 ${d.type}
📊 ${d.status}`,
            confirmKeyboard);
        }

        // ===== SAVE =====
        if (data === "add_confirm") {
            const s = state[chatId];
            const file = await getFile();

            file.data.push({
                id: Date.now(),
                ...s.data
            });

            await updateFile(file.data, file.sha);

            delete state[chatId];

            return bot.sendMessage(chatId, "✅ Project created", mainMenu);
        }

    } catch (e) {
        console.error("[CALLBACK ERROR]", e);
    }
});

// =======================
// MESSAGE FLOW
// =======================
bot.on("message", async (msg) => {
    try {
        const chatId = msg.chat.id;

        if (!isAdmin(msg.from.id)) return;
        if (!state[chatId]) return;

        const s = state[chatId];

        // EDIT
        if (s.mode === "edit") {
            const file = await getFile();
            const p = file.data.find(x => x.id === s.id);
            if (!p) return;

            p.title = msg.text;

            await updateFile(file.data, file.sha);

            delete state[chatId];

            return bot.sendMessage(chatId, "✏️ Updated", mainMenu);
        }

        // ADD FLOW
        if (s.step === "title") {
            s.data.title = msg.text;
            s.step = "short";
            return bot.sendMessage(chatId, "🧾 Short:", backCancel);
        }

        if (s.step === "short") {
            s.data.shortDescription = msg.text;
            s.step = "desc";
            return bot.sendMessage(chatId, "📄 Description:", backCancel);
        }

        if (s.step === "desc") {
            s.data.description = msg.text;
            s.step = "stack";
            return bot.sendMessage(chatId, "⚙️ Stack:", backCancel);
        }

        if (s.step === "stack") {
            s.data.stack = msg.text.split(",").map(x => x.trim());
            s.step = "url";
            return bot.sendMessage(chatId, "🔗 URL:", backCancel);
        }

        if (s.step === "url") {
            s.data.url = msg.text;
            s.step = "type";

            return bot.sendMessage(chatId, "Select TYPE:", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🌐 Site", callback_data: "add_type_site" }],
                        [{ text: "📱 App", callback_data: "add_type_app" }],
                        [{ text: "🤖 Bot", callback_data: "add_type_bot" }],
                        [{ text: "⚙️ Tool", callback_data: "add_type_tool" }]
                    ]
                }
            });
        }

    } catch (e) {
        console.error("[MESSAGE ERROR]", e);
    }
});

// =======================
// KEEP ALIVE (optional)
// =======================
setInterval(() => {
    console.log("alive ping");
}, 1000 * 60 * 5);

// =======================
// GLOBAL ERRORS
// =======================
process.on("uncaughtException", e => console.error("[FATAL]", e));
process.on("unhandledRejection", e => console.error("[PROMISE]", e));

log("BOT STARTED");
