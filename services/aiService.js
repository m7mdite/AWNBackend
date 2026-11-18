// الاتصال بـ Ollama (على نفس الجهاز). يستخدم fetch المدمج في Node 18+
const cfg = () => ({
  url: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
  model: process.env.OLLAMA_MODEL || 'llama3.2',
  timeout: Number(process.env.AI_TIMEOUT_MS) || 120000,
  maxConcurrent: Number(process.env.AI_MAX_CONCURRENT) || 2
});

class AiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// حد للطلبات المتزامنة على النموذج (الجهاز واحد وllama بطيء)
let active = 0;
const tryAcquire = () => {
  if (active >= cfg().maxConcurrent) return false;
  active++;
  return true;
};
const release = () => {
  active = Math.max(0, active - 1);
};

/**
 * @param {{systemPrompt: string, history: {role: string, content: string}[], message: string}} p
 * @returns {Promise<string>} نص رد المساعد
 */
async function chat({ systemPrompt, history, message }) {
  const { url, model, timeout } = cfg();
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message }
  ];

  let res;
  try {
    res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.7 } }),
      signal: AbortSignal.timeout(timeout)
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new AiError('انتهت مهلة المساعد، حاول مجددًا بسؤال أقصر', 504);
    }
    console.error('Ollama unreachable:', e.message);
    throw new AiError('المساعد غير متاح حاليًا', 503);
  }

  if (!res.ok) {
    console.error('Ollama error', res.status, (await res.text()).slice(0, 300));
    throw new AiError('تعذر الحصول على رد من المساعد', 502);
  }

  const data = await res.json();
  const reply = data && data.message && typeof data.message.content === 'string' ? data.message.content.trim() : '';
  if (!reply) throw new AiError('رد فارغ من المساعد', 502);
  return reply;
}

module.exports = { chat, tryAcquire, release, AiError };
