import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Bot is running");
});

app.listen(PORT, () => {
    console.log("HTTP server running on", PORT);
});

// TELEGRAM
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const ADMIN_ID = Number(process.env.ADMIN_ID);
const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const PATH = process.env.FILE_PATH;
const TOKEN = process.env.GITHUB_TOKEN;

const state = {};

const log = (...a) => console.log("[BOT]", ...a);
const isAdmin = (id) => id === ADMIN_ID;

// ═══════════════════════════════════════════════════════════
// 🎨 BEAUTIFUL UI COMPONENTS
// ═══════════════════════════════════════════════════════════

const getProgressBar = (current, total) => {
    const filled = Math.round((current / total) * 10);
    const empty = 10 - filled;
    return "▪".repeat(filled) + "░".repeat(empty);
};

const getStatusEmoji = (status) => {
    const statusMap = {
        "in_progress": "🟡",
        "done": "🟢",
        "not_started": "⚪"
    };
    return statusMap[status] || "❓";
};

const getTypeEmoji = (type) => {
    const typeMap = {
        "site": "🌐",
        "app": "📱",
        "bot": "🤖",
        "tool": "⚙️"
    };
    return typeMap[type] || "📦";
};

// Main menu - clean and organized
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: "➕ Добавить", callback_data: "add" },
                { text: "📋 Список", callback_data: "list" }
            ],
            [
                { text: "✏️ Редактировать", callback_data: "edit_menu" },
                { text: "🗑️ Удалить", callback_data: "delete_menu" }
            ]
        ]
    }
};

const backCancel = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: "⬅️ Назад", callback_data: "add_back" },
                { text: "❌ Отмена", callback_data: "cancel" }
            ]
        ]
    }
};

const confirmKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "✅ Сохранить", callback_data: "add_confirm" }],
            [
                { text: "🔙 Назад", callback_data: "add_back" },
                { text: "❌ Отмена", callback_data: "cancel" }
            ]
        ]
    }
};

// ═══════════════════════════════════════════════════════════
// 📡 GITHUB API
// ═══════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════
// 🚀 BOT HANDLERS
// ═══════════════════════════════════════════════════════════

// START
bot.onText(/\/start/, (msg) => {
    if (!isAdmin(msg.from.id)) {
        return bot.sendMessage(msg.chat.id, "❌ У вас нет доступа к этому боту");
    }
    
    const welcomeText = `

 📦 ПАНЕЛЬ АДМИНИСТРАТОРА       
══════════════════════════

Добро пожаловать! Здесь вы можете управлять своими проектами.

Выберите действие ниже:
`;
    
    bot.sendMessage(msg.chat.id, welcomeText, mainMenu);
});

// CALLBACK QUERIES
bot.on("callback_query", async (q) => {
    try {
        const chatId = q.message.chat.id;
        const data = q.data;

        await bot.answerCallbackQuery(q.id).catch(() => {});
        if (!isAdmin(q.from.id)) return;

        log("CLICK:", data);

        // ─────────────────────────────────────────
        // 📋 LIST PROJECTS
        // ───────────────────────────────────��─────
        if (data === "list") {
            const file = await getFile();
            
            if (file.data.length === 0) {
                return bot.sendMessage(chatId, "📭 Нет проектов\n\nНажмите ➕ Добавить для создания первого проекта", mainMenu);
            }

            let text = `

📋 ВСЕ ПРОЕКТЫ (${file.data.length})          
══════════════════════════

`;
            file.data.forEach((p, index) => {
                text += `${index + 1}. ${getTypeEmoji(p.type)} ${p.title}
   ${getStatusEmoji(p.status)} Статус: ${p.status}
   🔗 ${p.url}
${index < file.data.length - 1 ? "─────────────────────────────\n" : ""}`;
            });

            return bot.sendMessage(chatId, text, mainMenu);
        }

        // ─────────────────────────────────────────
        // 🗑️ DELETE PROJECT
        // ─────────────────────────────────────────
        if (data === "delete_menu") {
            const file = await getFile();
            
            if (file.data.length === 0) {
                return bot.sendMessage(chatId, "📭 Нет проектов для удаления", mainMenu);
            }

            const buttons = file.data.map(p => ([{
                text: `🗑️ ${p.title}`,
                callback_data: `del_${p.id}`
            }]));
            buttons.push([{ text: "❌ Отмена", callback_data: "cancel" }]);

            return bot.sendMessage(chatId, "🗑️ Выберите проект для удаления:", {
                reply_markup: { inline_keyboard: buttons }
            });
        }

        if (data.startsWith("del_")) {
            const id = Number(data.split("_")[1]);
            const file = await getFile();
            const project = file.data.find(p => p.id === id);
            
            file.data = file.data.filter(p => p.id !== id);
            await updateFile(file.data, file.sha);
            
            return bot.sendMessage(chatId, `✅ Проект "${project.title}" удален`, mainMenu);
        }

        // ─────────────────────────────────────────
        // ✏️ EDIT PROJECT
        // ─────────────────────────────────────────
        if (data === "edit_menu") {
            const file = await getFile();
            
            if (file.data.length === 0) {
                return bot.sendMessage(chatId, "📭 Нет проектов для редактирования", mainMenu);
            }

            const buttons = file.data.map(p => ([{
                text: `✏️ ${p.title}`,
                callback_data: `edit_${p.id}`
            }]));
            buttons.push([{ text: "❌ Отмена", callback_data: "cancel" }]);

            return bot.sendMessage(chatId, "✏️ Выберите проект для редактирования:", {
                reply_markup: { inline_keyboard: buttons }
            });
        }

        if (data.startsWith("edit_") && !data.startsWith("edit_field_") && !data.startsWith("edit_status_val_")) {
            const id = Number(data.split("_")[1]);
            const file = await getFile();
            const project = file.data.find(p => p.id === id);
            
            if (!project) return bot.sendMessage(chatId, "❌ Проект не найден", mainMenu);

            const editText = `

✏️ РЕДАКТИРОВАНИЕ 
══════════════════════════

📌 Проект: ${project.title}

Что вы хотите изменить?
`;
            
            return bot.sendMessage(chatId, editText, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📝 Название", callback_data: `edit_field_title_${id}` }],
                        [{ text: "🧾 Краткое описание", callback_data: `edit_field_shortDescription_${id}` }],
                        [{ text: "📄 Полное описание", callback_data: `edit_field_description_${id}` }],
                        [{ text: "⚙️ Стек технологий", callback_data: `edit_field_stack_${id}` }],
                        [{ text: "📊 Статус", callback_data: `edit_field_status_${id}` }],
                        [{ text: "❌ Отмена", callback_data: "cancel" }]
                    ]
                }
            });
        }

        if (data.startsWith("edit_field_")) {
            const [_, __, field, idString] = data.split("_");
            const id = Number(idString);
            state[chatId] = { mode: "edit", id, field };

            if (field === "status") {
                return bot.sendMessage(chatId, "📊 Выберите новый статус:", {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🟡 В процессе", callback_data: `edit_status_val_${id}_in_progress` }],
                            [{ text: "🟢 Завершено", callback_data: `edit_status_val_${id}_done` }],
                            [{ text: "⚪ Не начиналось", callback_data: `edit_status_val_${id}_not_started` }],
                            [{ text: "❌ Отмена", callback_data: "cancel" }]
                        ]
                    }
                });
            }

            if (field === "stack") {
                return bot.sendMessage(chatId, `⚙️ Отправьте стек (через запятую):`, backCancel);
            }

            const labels = {
                title: "Название",
                shortDescription: "Краткое описание",
                description: "Полное описание"
            };

            return bot.sendMessage(chatId, `📝 Отправьте новое "${labels[field] || field}":`, backCancel);
        }

        if (data.startsWith("edit_status_val_")) {
            const parts = data.split("_");
            const id = Number(parts[3]);
            const status = parts.slice(4).join("_");
            const file = await getFile();
            const project = file.data.find(p => p.id === id);
            
            if (!project) return bot.sendMessage(chatId, "❌ Проект не найден", mainMenu);

            project.status = status;
            await updateFile(file.data, file.sha);

            delete state[chatId];
            return bot.sendMessage(chatId, `✅ Статус обновлен: ${getStatusEmoji(status)} ${status}`, mainMenu);
        }

        // ─────────────────────────────────────────
        // ➕ ADD PROJECT
        // ─────────────────────────────────────────
        if (data === "add") {
            state[chatId] = {
                mode: "add",
                step: "title",
                data: {},
                startTime: Date.now()
            };
            
            const addText = `

➕ ДОБАВЛЕНИЕ ПРОЕКТА
══════════════════════════

${getProgressBar(1, 6)}
ШАГ 1/6: Название проекта

Введите название вашего проекта:
`;
            
            return bot.sendMessage(chatId, addText, backCancel);
        }

        // ─────────────────────────────────────────
        // NAVIGATION
        // ─────────────────────────────────────────
        if (data === "cancel") {
            delete state[chatId];
            return bot.sendMessage(chatId, "❌ Операция отменена", mainMenu);
        }

        if (data === "add_back") {
            const s = state[chatId];
            if (!s) return;

            const steps = ["title", "short", "desc", "stack", "url", "type", "status"];
            const currentIdx = steps.indexOf(s.step);
            
            if (currentIdx > 0) {
                s.step = steps[currentIdx - 1];
                
                const stepMessages = {
                    title: `${getProgressBar(1, 6)}\nШАГ 1/6: Название проекта\n\nВведите название:`,
                    short: `${getProgressBar(2, 6)}\nШАГ 2/6: Краткое описание\n\nВведите краткое описание:`,
                    desc: `${getProgressBar(3, 6)}\nШАГ 3/6: Полное описание\n\nВведите полное описание:`,
                    stack: `${getProgressBar(4, 6)}\nШАГ 4/6: Стек технологий\n\nВведите стек (через запятую):`,
                    url: `${getProgressBar(5, 6)}\nШАГ 5/6: URL проекта\n\nВведите URL:`,
                    type: `${getProgressBar(6, 6)}\nШАГ 6/6: Тип проекта\n\nВыберите тип:`,
                };

                if (s.step === "type") {
                    return bot.sendMessage(chatId, stepMessages[s.step], {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "🌐 Сайт", callback_data: "add_type_site" }],
                                [{ text: "📱 Приложение", callback_data: "add_type_app" }],
                                [{ text: "🤖 Бот", callback_data: "add_type_bot" }],
                                [{ text: "⚙️ Инструмент", callback_data: "add_type_tool" }]
                            ]
                        }
                    });
                } else if (s.step === "status") {
                    return bot.sendMessage(chatId, `${getProgressBar(6, 6)}\nШАГ 6/6: Статус проекта\n\nВыберите статус:`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "🟡 В процессе", callback_data: "add_status_in_progress" }],
                                [{ text: "🟢 Завершено", callback_data: "add_status_done" }],
                                [{ text: "⚪ Не начиналось", callback_data: "add_status_not_started" }]
                            ]
                        }
                    });
                } else {
                    return bot.sendMessage(chatId, stepMessages[s.step], backCancel);
                }
            } else {
                delete state[chatId];
                return bot.sendMessage(chatId, "❌ Операция отменена", mainMenu);
            }
        }

        // TYPE SELECTION
        if (data.startsWith("add_type_")) {
            const val = data.replace("add_type_", "");
            state[chatId].data.type = val;
            state[chatId].step = "status";

            return bot.sendMessage(chatId, `${getProgressBar(6, 6)}\nШАГ 6/6: Статус проекта\n\nВыберите статус:`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🟡 В процессе", callback_data: "add_status_in_progress" }],
                        [{ text: "🟢 Завершено", callback_data: "add_status_done" }],
                        [{ text: "⚪ Не начиналось", callback_data: "add_status_not_started" }]
                    ]
                }
            });
        }

        // STATUS SELECTION
        if (data.startsWith("add_status_")) {
            const val = data.replace("add_status_", "");
            state[chatId].data.status = val;
            state[chatId].step = "preview";

            const d = state[chatId].data;

            const previewText = `

 ✅ ПРОВЕРКА ДАННЫХ
══════════════════════════

📌 Название:
${d.title}

🧾 Краткое описание:
${d.shortDescription}

📄 Полное описание:
${d.description}

⚙️ Стек:
${Array.isArray(d.stack) ? d.stack.join(", ") : d.stack}

🔗 URL:
${d.url}

🏷️ Тип: ${getTypeEmoji(d.type)} ${d.type}

📊 Статус: ${getStatusEmoji(d.status)} ${d.status}

─────────────────────────────────────
Всё верно? Нажмите "Сохранить"
`;

            return bot.sendMessage(chatId, previewText, confirmKeyboard);
        }

        // SAVE PROJECT
        if (data === "add_confirm") {
            const s = state[chatId];
            const file = await getFile();

            file.data.push({
                id: Date.now(),
                ...s.data
            });

            await updateFile(file.data, file.sha);

            delete state[chatId];

            const successText = `

 ✅ УСПЕШНО!   
══════════════════════════

Проект "${s.data.title}" создан 🎉

Вернитесь в главное меню для дальнейших действий.
`;

            return bot.sendMessage(chatId, successText, mainMenu);
        }

    } catch (e) {
        console.error("[CALLBACK ERROR]", e);
        bot.sendMessage(q.message.chat.id, "❌ Ошибка при обработке запроса", mainMenu);
    }
});

// ═══════════════════════════════════════════════════════════
// 💬 MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════

bot.on("message", async (msg) => {
    try {
        const chatId = msg.chat.id;

        if (!isAdmin(msg.from.id)) return;
        if (!state[chatId]) return;

        const s = state[chatId];

        // EDIT MODE
        if (s.mode === "edit") {
            const file = await getFile();
            const p = file.data.find(x => x.id === s.id);
            if (!p) return;

            if (s.field === "title") {
                p.title = msg.text;
            } else if (s.field === "shortDescription") {
                p.shortDescription = msg.text;
            } else if (s.field === "description") {
                p.description = msg.text;
            } else if (s.field === "stack") {
                p.stack = msg.text.split(",").map(x => x.trim());
            } else {
                return bot.sendMessage(chatId, "❌ Неизвестное поле", mainMenu);
            }

            await updateFile(file.data, file.sha);
            delete state[chatId];

            return bot.sendMessage(chatId, `✅ "${s.field}" обновлено`, mainMenu);
        }

        // ADD MODE - STEP BY STEP
        if (s.step === "title") {
            s.data.title = msg.text;
            s.step = "short";
            return bot.sendMessage(chatId, `${getProgressBar(2, 6)}\nШАГ 2/6: Краткое описание\n\nВведите краткое описание:`, backCancel);
        }

        if (s.step === "short") {
            s.data.shortDescription = msg.text;
            s.step = "desc";
            return bot.sendMessage(chatId, `${getProgressBar(3, 6)}\nШАГ 3/6: Полное описание\n\nВведите полное описание:`, backCancel);
        }

        if (s.step === "desc") {
            s.data.description = msg.text;
            s.step = "stack";
            return bot.sendMessage(chatId, `${getProgressBar(4, 6)}\nШАГ 4/6: Стек технологий\n\nВведите стек (через запятую):\n\nПример: React, Node.js, PostgreSQL`, backCancel);
        }

        if (s.step === "stack") {
            s.data.stack = msg.text.split(",").map(x => x.trim());
            s.step = "url";
            return bot.sendMessage(chatId, `${getProgressBar(5, 6)}\nШАГ 5/6: URL проекта\n\nВведите URL проекта:`, backCancel);
        }

        if (s.step === "url") {
            s.data.url = msg.text;
            s.step = "type";

            return bot.sendMessage(chatId, `${getProgressBar(6, 6)}\nШАГ 6/6: Тип проекта\n\nВыберите тип проекта:`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🌐 Сайт", callback_data: "add_type_site" }],
                        [{ text: "📱 Приложение", callback_data: "add_type_app" }],
                        [{ text: "🤖 Бот", callback_data: "add_type_bot" }],
                        [{ text: "⚙️ Инструмент", callback_data: "add_type_tool" }]
                    ]
                }
            });
        }

    } catch (e) {
        console.error("[MESSAGE ERROR]", e);
        bot.sendMessage(chatId, "❌ Ошибка при обработке сообщения", mainMenu);
    }
});

// Keep-alive ping
setInterval(() => {
    console.log("alive ping");
}, 1000 * 60 * 5);

// Error handling
process.on("uncaughtException", e => console.error("[FATAL]", e));
process.on("unhandledRejection", e => console.error("[PROMISE]", e));

log("BOT STARTED ✅");
