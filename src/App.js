import React, { useState } from 'react';
import { createWorker } from 'tesseract.js';

const SellAnalyzer = () => {
  const [trades, setTrades] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [rawOcrData, setRawOcrData] = useState([]);
  const [showCorrection, setShowCorrection] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);

  // Enhanced pattern matching with better Total detection
  const parseSellTransactions = (text, confidence, imageIndex) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const trades = [];
    
    console.log(`🔍 OCR Text for image ${imageIndex + 1}:`);
    console.log(text);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      if (line.includes('sell') || line.includes('prodej')) {
        const contextStart = Math.max(0, i - 2);
        const contextEnd = Math.min(lines.length, i + 3);
        const contextLines = lines.slice(contextStart, contextEnd);
        const fullContext = contextLines.join(' ');
        
        console.log(`💰 SELL context: "${fullContext}"`);
        
        let pair = null;
        let total = null;
        let result = null;
        
        // Extract trading pair
        const pairMatch = fullContext.match(/([A-Z]{2,6})[\s\/\-]*(USDT|USD)/i);
        if (pairMatch) {
          pair = `${pairMatch[1]}/${pairMatch[2] || 'USDT'}`.toUpperCase();
        }
        
        // Enhanced Total extraction - look for realistic trading amounts
        const numberMatches = [...fullContext.matchAll(/(\d+(?:\.\d+)?)/g)];
        const potentialTotals = [];
        
        for (const match of numberMatches) {
          const value = parseFloat(match[1]);
          // Filter for realistic trading amounts (exclude dates, small percentages)
          if (value >= 50 && value <= 50000) {
            potentialTotals.push(value);
          }
        }
        
        // Choose the largest realistic number as Total (trading amounts are usually larger)
        if (potentialTotals.length > 0) {
          total = Math.max(...potentialTotals);
        }
        
        // Extract result percentage
        const resultMatch = fullContext.match(/([+-]?\d{1,2}\.?\d{0,3})\s*%/);
        if (resultMatch) {
          result = parseFloat(resultMatch[1]);
        }
        
        // Create trade with best guess - user can correct later
        if (pair) {
          trades.push({
            id: Date.now() + Math.random(),
            pair,
            total: total || 0, // Default to 0 if not found
            result: result || 0, // Default to 0 if not found
            profit: ((total || 0) * (result || 0)) / 100,
            source: `Image ${imageIndex + 1}`,
            confidence,
            needsCorrection: !total || total < 50 || !result, // Flag suspicious data
            rawContext: fullContext.substring(0, 150)
          });
        }
      }
    }
    
    return trades;
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || e.dataTransfer?.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) return;

    setLoading(true);
    setProgress({ current: 0, total: imageFiles.length, percent: 0 });
    
    const screenshotPreviews = [];
    for (const file of imageFiles) {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve) => {
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
      screenshotPreviews.push({ file, preview: dataUrl, name: file.name });
    }
    setScreenshots(screenshotPreviews);
    
    const allTrades = [];
    const allRawData = [];
    
    try {
      const worker = await createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            setProgress(prev => ({ ...prev, percent: Math.round(m.progress * 100) }));
          }
        }
      });

      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-%/+:()[] ',
        tessedit_pageseg_mode: '6',
      });
      
      for (let i = 0; i < imageFiles.length; i++) {
        setProgress(prev => ({ ...prev, current: i + 1 }));
        
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        await new Promise((resolve) => {
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            resolve();
          };
          img.src = screenshotPreviews[i].preview;
        });
        
        const { data: { text, confidence } } = await worker.recognize(canvas);
        
        const trades = parseSellTransactions(text, confidence, i);
        allTrades.push(...trades);
        
        allRawData.push({
          imageIndex: i,
          text,
          confidence,
          trades,
          preview: screenshotPreviews[i].preview
        });
        
        const percent = Math.round(((i + 1) / imageFiles.length) * 100);
        setProgress(prev => ({ ...prev, percent }));
      }
      
      await worker.terminate();
      
    } catch (error) {
      console.error('OCR Error:', error);
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0, percent: 0 });
    }
    
    setRawOcrData(allRawData);
    setTrades(allTrades);
    setShowCorrection(true); // Always show correction interface
  };

  // Quick edit trade
  const startEdit = (trade) => {
    setEditingTrade({ ...trade });
  };

  const saveEdit = () => {
    if (!editingTrade) return;
    
    const updatedTrade = {
      ...editingTrade,
      total: parseFloat(editingTrade.total) || 0,
      result: parseFloat(editingTrade.result) || 0,
      needsCorrection: false
    };
    updatedTrade.profit = (updatedTrade.total * updatedTrade.result) / 100;
    
    setTrades(prev => prev.map(t => t.id === updatedTrade.id ? updatedTrade : t));
    setEditingTrade(null);
  };

  const cancelEdit = () => {
    setEditingTrade(null);
  };

  const deleteTrade = (id) => {
    setTrades(prev => prev.filter(t => t.id !== id));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('border-red-400', 'bg-red-900/20');
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-red-400', 'bg-red-900/20');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-red-400', 'bg-red-900/20');
    handleFileUpload(e);
  };

  const clearAll = () => {
    setTrades([]);
    setScreenshots([]);
    setRawOcrData([]);
    setShowCorrection(false);
    setEditingTrade(null);
  };

  // Stats
  const totalProfit = trades.reduce((sum, trade) => sum + trade.profit, 0);
  const avgResult = trades.length > 0 ? trades.reduce((sum, trade) => sum + trade.result, 0) / trades.length : 0;
  const totalAmount = trades.reduce((sum, trade) => sum + trade.total, 0);
  const needsCorrection = trades.filter(t => t.needsCorrection).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
            ✏️ OCR + Smart Correction
          </h1>
          <p className="text-xl text-gray-300">
            OCR rozpoznání → Quick correction interface → Perfect data
          </p>
        </div>

        {/* Upload Section */}
        <div className="bg-white/10 rounded-2xl p-8 mb-8 backdrop-blur-sm border border-white/20">
          <div 
            className="border-2 border-dashed border-red-500 rounded-xl p-16 text-center cursor-pointer transition-all duration-300 hover:border-red-400 hover:bg-red-900/10"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('fileInput').click()}
          >
            {loading ? (
              <div className="space-y-6">
                <div className="text-6xl animate-spin">✏️</div>
                <h3 className="text-2xl font-semibold">
                  OCR scanning {progress.current}/{progress.total}...
                </h3>
                <div className="w-full bg-gray-700 rounded-full h-4">
                  <div 
                    className="bg-gradient-to-r from-red-500 to-red-600 h-4 rounded-full transition-all duration-300" 
                    style={{ width: `${progress.percent}%` }}
                  ></div>
                </div>
                <div className="text-lg">{progress.percent}% - Připravuji korekční rozhraní...</div>
              </div>
            ) : (
              <div>
                <div className="text-8xl mb-6">✏️📱✏️</div>
                <h3 className="text-2xl font-semibold mb-4">OCR + Human Intelligence</h3>
                <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-lg p-6 mb-4">
                  <p className="text-white font-semibold mb-3">✏️ Hybrid approach:</p>
                  <div className="text-left text-sm space-y-2">
                    <div>1. 🤖 OCR vyextrahuje co dokáže (páry, % už fungují)</div>
                    <div>2. ⚠️ Označí podezřelá data (13 místo 274.1200)</div>
                    <div>3. ✏️ Vy rychle opravíte wrong hodnoty</div>
                    <div>4. ⚡ Instant přepočítání profit a statistik</div>
                  </div>
                </div>
                <p className="text-gray-300 text-lg mb-4">
                  <strong>OCR rychlost + Human přesnost = Perfect solution</strong>
                </p>
                <p className="text-gray-400">
                  Nahrajte screenshoty pro OCR + korekci
                </p>
              </div>
            )}
            <input 
              type="file" 
              id="fileInput" 
              accept="image/*" 
              multiple
              onChange={handleFileUpload}
              className="hidden"
              disabled={loading}
            />
          </div>
        </div>

        {/* Correction Interface */}
        {showCorrection && trades.length > 0 && (
          <div className="bg-white/10 rounded-2xl p-6 mb-8 backdrop-blur-sm border border-white/20">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-semibold">✏️ Quick Correction Interface</h3>
                {needsCorrection > 0 && (
                  <p className="text-yellow-400 text-sm">⚠️ {needsCorrection} transakcí potřebuje opravu</p>
                )}
              </div>
              <button 
                onClick={() => setShowCorrection(false)}
                className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500"
              >
                Skrýt
              </button>
            </div>
            
            <div className="space-y-4">
              {trades.map((trade) => (
                <div 
                  key={trade.id} 
                  className={`p-4 rounded-lg border ${
                    trade.needsCorrection 
                      ? 'bg-yellow-900/20 border-yellow-500' 
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  {editingTrade?.id === trade.id ? (
                    // Edit mode
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                      <input
                        value={editingTrade.pair}
                        onChange={(e) => setEditingTrade(prev => ({...prev, pair: e.target.value}))}
                        className="px-3 py-2 bg-black/30 rounded border border-white/30 text-white"
                        placeholder="SQR/USDT"
                      />
                      <input
                        type="number"
                        step="0.0001"
                        value={editingTrade.total}
                        onChange={(e) => setEditingTrade(prev => ({...prev, total: e.target.value}))}
                        className="px-3 py-2 bg-black/30 rounded border border-white/30 text-white"
                        placeholder="274.1200"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={editingTrade.result}
                        onChange={(e) => setEditingTrade(prev => ({...prev, result: e.target.value}))}
                        className="px-3 py-2 bg-black/30 rounded border border-white/30 text-white"
                        placeholder="6.26"
                      />
                      <div className="text-green-400 font-mono">
                        {((parseFloat(editingTrade.total) || 0) * (parseFloat(editingTrade.result) || 0) / 100).toFixed(4)}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          className="px-3 py-1 bg-green-600 rounded text-sm hover:bg-green-500"
                        >
                          ✓ Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1 bg-gray-600 rounded text-sm hover:bg-gray-500"
                        >
                          ✕ Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                      <div className="font-bold text-red-400">{trade.pair}</div>
                      <div className={`font-mono ${trade.needsCorrection && trade.total < 50 ? 'text-yellow-400' : ''}`}>
                        {trade.total.toFixed(4)}
                        {trade.needsCorrection && trade.total < 50 && <span className="text-xs ml-1">⚠️</span>}
                      </div>
                      <div className={`font-bold ${trade.result >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.result >= 0 ? '+' : ''}{trade.result.toFixed(2)}%
                      </div>
                      <div className={`font-mono font-bold ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(4)}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(trade)}
                          className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-500"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => deleteTrade(trade.id)}
                          className="px-3 py-1 bg-red-600 rounded text-sm hover:bg-red-500"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {trades.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-2xl p-6 text-center">
              <div className="text-4xl font-bold mb-2">{trades.length}</div>
              <div className="text-red-100">OCR + Corrected</div>
            </div>
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-center">
              <div className="text-4xl font-bold mb-2">{totalAmount.toFixed(2)}</div>
              <div className="text-blue-100">Total USDT</div>
            </div>
            <div className={`bg-gradient-to-r ${totalProfit >= 0 ? 'from-green-600 to-green-700' : 'from-red-600 to-red-700'} rounded-2xl p-6 text-center`}>
              <div className="text-4xl font-bold mb-2">
                {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(4)}
              </div>
              <div className={totalProfit >= 0 ? 'text-green-100' : 'text-red-100'}>
                Celkový profit
              </div>
            </div>
            <div className={`bg-gradient-to-r ${avgResult >= 0 ? 'from-green-600 to-green-700' : 'from-red-600 to-red-700'} rounded-2xl p-6 text-center`}>
              <div className="text-4xl font-bold mb-2">
                {avgResult >= 0 ? '+' : ''}{avgResult.toFixed(2)}%
              </div>
              <div className={avgResult >= 0 ? 'text-green-100' : 'text-red-100'}>
                Průměrný result
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-center gap-4 mb-8">
          <button
            onClick={clearAll}
            className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 rounded-lg font-semibold hover:from-red-700 hover:to-red-800 transition-all duration-300"
          >
            🗑️ Vymazat vše
          </button>
          {!showCorrection && trades.length > 0 && (
            <button
              onClick={() => setShowCorrection(true)}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition-all duration-300"
            >
              ✏️ Zobrazit korekce
            </button>
          )}
        </div>

        {/* Final Results Table */}
        {trades.length > 0 && (
          <div className="bg-white/10 rounded-2xl overflow-hidden backdrop-blur-sm border border-white/20 shadow-2xl">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6">
              <h2 className="text-2xl font-bold text-center">
                ✏️ Final Corrected SELL Transakce
              </h2>
              <p className="text-center text-red-100 text-sm mt-2">
                OCR + Human correction = Perfect accuracy
              </p>
            </div>
            
            <div className="hidden md:block">
              <div className="bg-red-900/30 px-8 py-4 border-b border-white/10">
                <div className="grid grid-cols-4 gap-8 font-bold text-xl">
                  <div>🔗 Pair</div>
                  <div>💰 Total</div>
                  <div>📊 Result</div>
                  <div>💎 Profit</div>
                </div>
              </div>
              <div className="divide-y divide-white/10">
                {trades.map((trade) => (
                  <div key={trade.id} className="px-8 py-6 hover:bg-white/5 transition-colors">
                    <div className="grid grid-cols-4 gap-8 items-center text-lg">
                      <div className="font-bold text-red-400 text-xl">{trade.pair}</div>
                      <div className="font-mono font-semibold">{trade.total.toFixed(4)}</div>
                      <div className={`font-bold text-xl ${trade.result >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.result >= 0 ? '+' : ''}{trade.result.toFixed(2)}%
                      </div>
                      <div className={`font-mono font-bold text-xl ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(4)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:hidden p-4 space-y-4">
              {trades.map((trade) => (
                <div key={trade.id} className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <div className="text-center mb-4">
                    <div className="font-bold text-2xl text-red-400">{trade.pair}</div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-300">💰 Total:</span>
                      <span className="font-mono font-semibold">{trade.total.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">📊 Result:</span>
                      <span className={`font-bold ${trade.result >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.result >= 0 ? '+' : ''}{trade.result.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">💎 Profit:</span>
                      <span className={`font-mono font-bold ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-gray-400">
          <p>✏️ OCR + Human Intelligence • Quick corrections • Perfect accuracy</p>
        </div>
      </div>
    </div>
  );
};

export default SellAnalyzer;
