const express = require('express');
const mongoose = require('mongoose');
const { Telegraf, Markup } = require('telegraf');

const app = express();
app.use(express.json());

// 1. Database Connect Karein
mongoose.connect('AAPA_MONGODB_URI_HERE');

// User, Keys aur Transaction Database Schema
const User = mongoose.model('User', new mongoose.Schema({
  telegramId: Number,
  balance: { type: Number, default: 0 }
}));

const Key = mongoose.model('Key', new mongoose.Schema({
  key: String,
  panel: String,
  isUsed: { type: Boolean, default: false }
}));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
  utr: String,
  userId: Number,
  amount: Number,
  status: String
}));

const bot = new Telegraf('AAPKA_TELEGRAM_BOT_TOKEN');

// ---------------- TELEGRAM BOT SYSTEM ----------------

// Start Command
bot.start(async (ctx) => {
  let user = await User.findOne({ telegramId: ctx.from.id });
  if (!user) {
    user = await User.create({ telegramId: ctx.from.id, balance: 0 });
  }
  ctx.reply('Panel Bot me Aapka Swagat Hai!', Markup.inlineKeyboard([
    [Markup.button.callback('👤 Profile', 'profile'), Markup.button.callback('🛒 Panel Store', 'store')],
    [Markup.button.callback('💳 Add Balance', 'add_balance'), Markup.button.callback('🎟️ Lucky Draw', 'draw')]
  ]));
});

// Profile Section
bot.action('profile', async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.from.id });
  ctx.reply(`👤 *Aapki Profile Details*\n\nUser ID: \`${ctx.from.id}\`\nBalance: ₹${user ? user.balance : 0}`, { parse_mode: 'Markdown' });
});

// UTR Payment Verification System
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  
  // Agar user 12-digit UTR number bhejta hai
  if (/^\d{12}$/.test(text)) {
    // 1. Check karein ki UTR pehle use toh nahi hua
    const existingTxn = await Transaction.findOne({ utr: text });
    if (existingTxn) {
      return ctx.reply('❌ Yeh UTR pehle se istemaal ho chuka hai!');
    }

    // 2. Yahan Payment Gateway API se live match check hoga
    const isPaymentValid = await checkBankAPI(text); // Bank/Gateway API call

    if (isPaymentValid.success) {
      await Transaction.create({ utr: text, userId: ctx.from.id, amount: isPaymentValid.amount, status: 'Success' });
      await User.findOneAndUpdate({ telegramId: ctx.from.id }, { $inc: { balance: isPaymentValid.amount } });
      ctx.reply(`✅ Payment Verify Ho Gaya! ₹${isPaymentValid.amount} aapke balance me add kar diye gaye hain.`);
    } else {
      ctx.reply('❌ Payment verification fail ho gaya. UTR number galat hai ya payment receive nahi hua.');
    }
  }
});

// ---------------- OWNER WEB ADMIN PANEL APIs ----------------

// Security Check: Sirf Owner hi Web Panel use kar sake
const isOwner = (req, res, next) => {
  if (req.headers['x-owner-key'] === 'AAPKA_SECRET_ADMIN_KEY') return next();
  res.status(403).json({ error: 'Access Denied' });
};

// 1. User Balance Add/Remove karne ki API
app.post('/admin/update-balance', isOwner, async (req, res) => {
  const { userId, amount } = req.body;
  const user = await User.findOneAndUpdate(
    { telegramId: userId }, 
    { $inc: { balance: amount } }, 
    { new: true, upsert: true }
  );
  res.json({ success: true, newBalance: user.balance });
});

// 2. Panel Keys Add karne ki API (Purana data delete nahi hoga)
app.post('/admin/add-keys', isOwner, async (req, res) => {
  const { keys, panel } = req.body;
  const keyDocs = keys.map(k => ({ key: k, panel: panel }));
  await Key.insertMany(keyDocs);
  res.json({ success: true, message: 'Naye Keys Safe Add Ho Gaye!' });
});

bot.launch();
app.listen(3000, () => console.log('Bot aur Admin Web Panel Chalu Hai!'));
