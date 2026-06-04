import { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

// Simplified SOC AI engine - port of the original SOCAI object
function generateResponse(state, query) {
  const q = query.toLowerCase();
  const { currentSpot, chainData, currentExpiry, currentDataDate, currentTime, currentSymbol } = state;

  if (!chainData?.length) {
    return { text: 'Data not loaded yet. Please wait for option chain to load.' };
  }

  // Basic info
  if (q.includes('spot') || q.includes('price') || q.includes('kya hai')) {
    return { text: `📍 <b>Spot Price:</b> ${currentSpot?.toLocaleString() || '--'}<br>Symbol: ${currentSymbol}<br>Expiry: ${currentExpiry}<br>Time: ${currentTime}` };
  }

  // Support / Resistance
  if (q.includes('support') || q.includes('resistance') || q.includes('level')) {
    const byCallOI = [...chainData].sort((a, b) => (b.call?.oi || 0) - (a.call?.oi || 0));
    const byPutOI = [...chainData].sort((a, b) => (b.put?.oi || 0) - (a.put?.oi || 0));
    return {
      text: `🛡️ <b>Key Levels:</b><br><br>
        <b>Resistance:</b> ${byCallOI[0]?.strike} (${((byCallOI[0]?.call?.oi || 0) / 100000).toFixed(1)}L Call OI)<br>
        <b>Support:</b> ${byPutOI[0]?.strike} (${((byPutOI[0]?.put?.oi || 0) / 100000).toFixed(1)}L Put OI)`
    };
  }

  // PCR
  if (q.includes('pcr') || q.includes('ratio') || q.includes('sentiment')) {
    const totalCallOI = chainData.reduce((s, r) => s + (r.call?.oi || 0), 0);
    const totalPutOI = chainData.reduce((s, r) => s + (r.put?.oi || 0), 0);
    const pcr = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : '0.00';
    const sentiment = pcr > 1.2 ? 'BEARISH' : pcr < 0.8 ? 'BULLISH' : 'NEUTRAL';
    return { text: `📊 <b>PCR Analysis:</b><br><br>PCR (OI): ${pcr}<br>Sentiment: ${sentiment}` };
  }

  // Market Analysis
  if (q.includes('market') || q.includes('analysis') || q.includes('overall')) {
    const byCallOI = [...chainData].sort((a, b) => (b.call?.oi || 0) - (a.call?.oi || 0));
    const byPutOI = [...chainData].sort((a, b) => (b.put?.oi || 0) - (a.put?.oi || 0));
    const totalCallOI = chainData.reduce((s, r) => s + (r.call?.oi || 0), 0);
    const totalPutOI = chainData.reduce((s, r) => s + (r.put?.oi || 0), 0);
    const pcr = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : '0.00';
    return {
      text: `📊 <b>Market Analysis:</b><br><br>
        Spot: ${currentSpot?.toLocaleString()}<br>
        Resistance: ${byCallOI[0]?.strike}<br>
        Support: ${byPutOI[0]?.strike}<br>
        PCR: ${pcr}<br><br>
        ⚠️ Ye analysis hai, trading advice nahi`
    };
  }

  // Help
  if (q.includes('help')) {
    return { text: `🤖 <b>SOC AI Commands:</b><br>"spot" | "support resistance" | "pcr" | "market analysis"` };
  }

  return { text: `🤖 Try: "spot", "support", "pcr", "market analysis", "help"` };
}

export default function SOCAIPanel() {
  const { state, dispatch } = useApp();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  if (!state.socAIPanelOpen) {
    return (
      <div id="socAIbtn" onClick={() => dispatch({ type: 'SET_SOC_AI', payload: true })}>
        <img src="/socai.png" alt="AI" style={{ width: '150px', height: '70px' }} />
      </div>
    );
  }

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');

    const response = generateResponse(state, userMsg);
    setMessages(prev => [...prev, { role: 'ai', text: response.text }]);
  };

  const handleAnalyze = () => {
    const response = generateResponse(state, 'market analysis');
    setMessages(prev => [...prev, { role: 'ai', text: response.text }]);
  };

  return (
    <div id="socAIpanel" style={{ display: 'flex' }}>
      <div id="socAIheader">
        SOC AI ASSIST
        <span id="socAIclose" onClick={() => dispatch({ type: 'SET_SOC_AI', payload: false })}>✖</span>
      </div>
      <div id="socAIbody" ref={chatRef}>
        <div id="socAIchat">
          {messages.length === 0 && 'Ask anything about market...'}
          {messages.map((m, i) => (
            <div key={i} style={{
              marginBottom: '10px',
              ...(m.role === 'ai' ? { background: '#e8f4fd', padding: '10px', borderRadius: '6px', borderLeft: '3px solid #2196f3' } : {}),
            }}>
              <b>{m.role === 'user' ? 'You' : '🤖 SOC AI'}:</b>
              <span dangerouslySetInnerHTML={{ __html: m.role === 'user' ? m.text : '<br>' + m.text }} />
            </div>
          ))}
        </div>
      </div>
      <div id="socAIfooter">
        <input
          id="socAIinput"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type your question..."
        />
        <button id="socAIsend" onClick={handleSend}>Send</button>
      </div>
      <div id="socAIanalysisBtn" onClick={handleAnalyze}>Analyze Market</div>
    </div>
  );
}