const CAT_KW = {
  Food: ['food','meal','lunch','dinner','breakfast','snack','restaurant','pizza','burger','shake','chai','tea','coffee','biryani','dosa','juice','fruit','vegetable','grocery','groceries','swiggy','zomato','kfc','mcdonalds','maggi','noodle','rice','roti','cake','icecream','sweet','lassi','paneer'],
  Transport: ['uber','ola','auto','rickshaw','taxi','metro','bus','train','petrol','diesel','fuel','toll','cab','rapido','flight','ticket'],
  Shopping: ['amazon','flipkart','myntra','ajio','cloth','shirt','pant','shoe','bag','purchase','dress','jeans','kurta'],
  Health: ['medicine','medical','doctor','hospital','clinic','pharmacy','tablet','injection','checkup','gym','yoga','fitness'],
  Entertainment: ['movie','cinema','netflix','hotstar','spotify','game','gaming','concert','party','event','fun'],
  Recharge: ['recharge','mobile','internet','wifi','broadband','electricity','bill','dth','jio','airtel','vi','bsnl','gas'],
};

const CAT_ICONS = { Food:'🍜', Transport:'🚗', Shopping:'🛍️', Health:'💊', Entertainment:'🎬', Recharge:'📱', Education:'📚', Grocerries:'🛒', Other:'📦' };

function localCategorize(desc) {
  const d = desc.toLowerCase();
  for (const [cat, kws] of Object.entries(CAT_KW)) {
    if (kws.some(k => d.includes(k))) return cat;
  }
  return 'Other';
}

export async function parseExpense(text, geminiApiKey) {
  const num = parseFloat(text.match(/\d+(\.\d+)?/)?.[0]);
  const rawDesc = text.replace(/^\d+(\.\d+)?\s*/, '').trim();
  if (!num || !rawDesc) return null;

  if (geminiApiKey) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: `Parse this expense and return ONLY a JSON object, no markdown: "${text}". Return: {"amount":NUMBER,"category":"Food|Transport|Shopping|Health|Entertainment|Recharge|Other","description":"clean short description","emoji":"single relevant emoji"}` }] }] }),
        }
      );
      const data = await r.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      if (parsed.amount && parsed.category) return parsed;
    } catch (e) {}
  }

  const cat = localCategorize(rawDesc);
  return {
    amount: num,
    category: cat,
    description: rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1),
    emoji: CAT_ICONS[cat],
  };
}

export async function askGemini(question, stats, budgets, geminiApiKey) {
  if (!geminiApiKey) return 'Set your Gemini API key in Settings to use the AI assistant.';
  const summary = `Total: ₹${stats.total?.toFixed(0)}, ${stats.count} expenses. Categories: ${stats.byCategory?.map(c => `${c.category} ₹${parseFloat(c.total).toFixed(0)}`).join(', ')}. Budgets: ${Object.entries(budgets).map(([k,v]) => `${k} ₹${v}`).join(', ') || 'none'}.`;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `You are a personal finance assistant for an Indian user. Data: ${summary}. Question: ${question}. Answer in 2-3 sentences, specific and actionable. Use ₹.` }] }] }),
      }
    );
    const data = await r.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';
  } catch (e) {
    return 'Error contacting Gemini. Check your API key in Settings.';
  }
}

export const CAT_COLORS = {
  Food: '#d08a3c',
  Transport: '#4b6a88',
  Shopping: '#2f8f6b',
  Health: '#c65b4b',
  Entertainment: '#b59a52',
  Recharge: '#5d8f87',
  Education: '#7a6fa8',
  Grocerries: '#6f9a4a',
  Other: '#8c9b93',
};
export { CAT_ICONS };
export function fmt(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }
