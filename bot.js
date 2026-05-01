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
// STATE MACHINE
// =======================
const state = {};

// =======================
// LOG
// =======================
const log = (...a) => console.log("[BOT]", ...a);

// =======================
// KEYBOARDS
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

const typeKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "🌐 Site", callback_data: "set_type_site" }],
            [{ text: "📱 App", callback_data: "set_type_app" }],
            [{ text: "🤖 Bot", callback_data: "set_type_bot" }],
            [{ text: "⚙️ Tool", callback_data: "set_type_tool" }]
        ]
    }
};

const statusKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "🟡 In progress", callback_data: "set_status_in_progress" }],
            [{ text: "🟢 Done", callback_data: "set_status_done" }],
            [{ text: "⚪ Not started", callback_data: "set_status_not_started" }]
        ]
    }
};

// =======================
// ADMIN CHECK
// =======================
const isAdmin = (id) => id === ADMIN_ID;

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
            message: "update via telegram bot",
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
    bot.sendMessage(msg.chat.id, "📦 SaaS Admin", mainMenu);
});

// =======================
// CALLBACK (CORE)
// =======================

bot.on("callback_query", async (q) => {
    try {
        const chatId = q.message?.chat?.id;
        const data = q.data;

        bot.answerCallbackQuery(q.id).catch(() => {});

        if (!isAdmin(q.from.id)) return;

        log("CLICK:", data);

        // ================= LIST =================
        if (data === "list") {
            const file = await getFile();

            let text = "📋 PROJECTS:\n\n";
            file.data.forEach(p => {
                text += `🆔 ${p.id}\n📌 ${p.title}\n⚡ ${p.status}\n\n`;
            });

            return bot.sendMessage(chatId, text, mainMenu);
        }

        // ================= DELETE MENU =================
        if (data === "delete_menu") {
            const file = await getFile();

            const buttons = file.data.map(p => ([{
                text: `❌ ${p.title}`,
                callback_data: `del_pick_${p.id}`
            }]));

            return bot.sendMessage(chatId, "Select project to delete:", {
                reply_markup: { inline_keyboard: buttons }
            });
        }

        // ================= DELETE CONFIRM =================
        if (data.startsWith("del_pick_")) {
            const id = Number(data.split("_")[2]);

            state[chatId] = { deleteId: id };

            return bot.sendMessage(chatId, "Are you sure?", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "YES DELETE", callback_data: `del_confirm_${id}` }],
                        [{ text: "CANCEL", callback_data: "cancel" }]
                    ]
                }
            });
        }

        if (data.startsWith("del_confirm_")) {
            const id = Number(data.split("_")[2]);

            const file = await getFile();
            file.data = file.data.filter(p => p.id !== id);

            await updateFile(file.data, file.sha);

            return bot.sendMessage(chatId, "🗑 Deleted", mainMenu);
        }

        if (data === "cancel") {
            return bot.sendMessage(chatId, "Cancelled", mainMenu);
        }

        // ================= EDIT FLOW =================
        if (data === "edit_menu") {
            const file = await getFile();

            const buttons = file.data.map(p => ([{
                text: `✏️ ${p.title}`,
                callback_data: `edit_pick_${p.id}`
            }]));

            return bot.sendMessage(chatId, "Pick project:", {
                reply_markup: { inline_keyboard: buttons }
            });
        }

        if (data.startsWith("edit_pick_")) {
            const id = Number(data.split("_")[2]);

            state[chatId] = { editId: id };

            return bot.sendMessage(chatId, "What to edit?", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Title", callback_data: "edit_field_title" }],
                        [{ text: "Status", callback_data: "edit_field_status" }],
                        [{ text: "Type", callback_data: "edit_field_type" }],
                        [{ text: "Description", callback_data: "edit_field_description" }]
                    ]
                }
            });
        }

        // ================= FIELD EDIT =================
        if (data.startsWith("edit_field_")) {
            const field = data.replace("edit_field_", "");

            state[chatId].field = field;

            if (field === "type") {
                state[chatId].mode = "type";
                return bot.sendMessage(chatId, "Select TYPE:", typeKeyboard);
            }

            if (field === "status") {
                state[chatId].mode = "status";
                return bot.sendMessage(chatId, "Select STATUS:", statusKeyboard);
            }

            state[chatId].mode = "text";
            return bot.sendMessage(chatId, "Send new value:");
        }

        // ================= TYPE SET =================
        if (data.startsWith("set_type_")) {
            const val = data.replace("set_type_", "");

            const file = await getFile();
            const p = file.data.find(x => x.id === state[chatId].editId);

            p.type = val;

            await updateFile(file.data, file.sha);

            return bot.sendMessage(chatId, "✅ Type updated", mainMenu);
        }

        // ================= STATUS SET =================
        if (data.startsWith("set_status_")) {
            const val = data.replace("set_status_", "");

            const file = await getFile();
            const p = file.data.find(x => x.id === state[chatId].editId);

            p.status = val;

            await updateFile(file.data, file.sha);

            return bot.sendMessage(chatId, "✅ Status updated", mainMenu);
        }

    } catch (e) {
        console.error("[CALLBACK ERROR]", e);
    }
});

// =======================
// TEXT INPUT (ONLY FOR SIMPLE EDIT FIELDS)
// =======================

bot.on("message", async (msg) => {
    try {
        const chatId = msg.chat.id;

        if (!isAdmin(msg.from.id)) return;
        if (!state[chatId]) return;

        const s = state[chatId];

        if (s.mode !== "text") return;

        const file = await getFile();
        const p = file.data.find(x => x.id === s.editId);

        if (!p) return;

        p[s.field] = msg.text;

        await updateFile(file.data, file.sha);

        delete state[chatId];

        return bot.sendMessage(chatId, "✏️ Updated", mainMenu);

    } catch (e) {
        console.error("[MESSAGE ERROR]", e);
    }
});
