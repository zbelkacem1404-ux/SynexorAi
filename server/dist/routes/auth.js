"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    const user = (0, schema_1.queryOne)('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!bcryptjs_1.default.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = (0, auth_1.generateToken)({
        userId: user.id,
        username: user.username,
        role: user.role
    });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});
router.get('/me', auth_1.authenticate, (req, res) => {
    res.json({ user: req.user });
});
exports.default = router;
