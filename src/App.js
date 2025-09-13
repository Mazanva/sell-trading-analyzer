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
  const [debugMode, setDebugMode] = useState(false);

  // %-First parsing strategy - nejspolehlivější approach
  const parsePercentageFirst = (ocrResult, imageIndex) => {
    const { words } = ocrResult.data;
    const trades = [];
    
    console.log(`🔍 Processing ${words.length} words with %-first strategy`);
    
    // Krok 1: Najdi všechna % s pozicemi
    const percentageWords = words.filter(word => {
      const text = word.text.trim();
      const hasPercent = text.includes('%') || /^[+-]?\d{1,3}\.?\d{0,3}$/.test(text);
      const isValidPercent = hasPercent && word.confidence > 20;
      return isValidPercent;
    });
    
    console.log(`📊 Found ${percentageWords.length} potential percentages:`, 
      percentageWords.map(w => `"${w.text}" at (${w.bbox.x0}, ${w.bbox.y0})`));
    
    for (const percentWord of percentageWords) {
      // Extract percentage value
      let percentValue = null;
      const text = percentWord.text.trim();
      
      // Various % extraction patterns
      const percentMatch = text.match(/([+-]?\d{1,3}\.?\d{0,3})%?/);
      if (percentMatch) {
        const value = parseFloat(percentMatch[1]);
        if (value >= -99 && value <= 99 && Math.abs(value) >= 0.1) {
          percentValue = value;
        }
      }
      
      if (percentValue === null) continue;
      
      const percentY = percentWord.bbox.y0;
      const percentHeight = percentWord.bbox.y1 - percentWord.bbox.y0;
      const rowTolerance = percentHeight * 2;
      
      console.log(`📈 Processing ${percentValue}% at row y=${percentY}`);
      
      // Krok 2: Najdi Total amount na stejném řádku (vlevo od %)
      let totalAmount = null;
      const potentialTotals = words.filter(word => {
        const wordY = word.bbox.y0;
        const isOnSameRow = Math.abs(wordY - percentY) <= rowTolerance;
        const isLeftOfPercent = word.bbox.x0 < percentWord.bbox.x0; // Vlevo od %
        const hasGoodConfidence = word.confidence > 15;
        return isOnSameRow && isLeftOfPercent && hasGoodConfidence;
      });
      
      // Seřaď potential totals podle vzdálenosti od % (nejbližší first)
      potentialTotals.sort((a, b) => {
        const distA = Math.abs(a.bbox.x0 - percentWord.bbox.x0);
        const distB = Math.abs(b.bbox.x0 - percentWord.bbox.x0);
        return distA - distB;
      });
      
      for (const totalWord of potentialTotals) {
        const totalText = totalWord.text.trim();
        
        // Realistic trading amounts
        if (/^\d{2,6}\.?\d{0,8}$/.test(totalText)) {
          const value = parseFloat(totalText);
          if (value >= 50 && value <= 100000) {
            // Extra validation - není to datum?
            if (!/^\d{1,2}$/.test(totalText)) { // Ignore single/double digits (dates)
              totalAmount = value;
              console.log(`💰 Found total ${totalAmount} for ${percentValue}%`);
              break;
            }
          }
        }
      }
      
      // Krok 3: Vypočítej profit (i bez pair)
      let profit = 0;
      if (totalAmount && percentValue !== null) {
        profit = (totalAmount * percentValue) / 100;
      }
      
      // Krok 4: Pokus se najít trading pair (není kritické)
      let tradingPair = null;
      const pairCandidates = words.filter(word => {
        const wordY = word.bbox.y0;
        const isOnSameRow = Math.abs(wordY - percentY) <= rowTolerance;
        const hasGoodConfidence = word.confidence > 10;
        return isOnSameRow && hasGoodConfidence;
      });
      
      // Hledej trading pair patterns
      for (const candidate of pairCandidates) {
        const text = candidate.text.trim().toUpperCase();
        
        // Direct pair match
        if (/^[A-Z]{2,6}[\/\-][A-Z]{3,4}$/.test(text)) {
          tradingPair = text.replace('-', '/');
          break;
        }
        
        // Known crypto symbols
        const knownCryptos = ['SQR', 'ALGO', 'BONK', 'DOGE', 'SHIB', 'ETC', 'OP', 'BTC', 'ETH', 'ADA', 'SOL', 'MATIC', 'AXS', 'ZTX', 'FIL'];
        if (knownCryptos.includes(text)) {
          tradingPair = `${text}/USDT`;
          break;
        }
        
        // Part of pair (look for USDT nearby)
        if (/^[A-Z]{2,6}$/.test(text) && text.length >= 3) {
          const nearbyWords = words.filter(w => 
            Math.abs(w.bbox.y0 - candidate.bbox.y0) <= rowTolerance &&
            Math.abs(w.bbox.x0 - candidate.bbox.x0) <= 100
          );
          
          const hasUSDT = nearbyWords.some(w => 
            w.text.toUpperCase().includes('USDT') || w.text.toUpperCase().includes('USD')
          );
          
          if (hasUSDT) {
            tradingPair = `${text}/USDT`;
            break;
          }
        }
      }
      
      // Vytvoř trade pokud máme alespoň % a total
      if (percentValue !== null && totalAmount) {
        const trade = {
          id: Date.now() + Math.random(),
          pair: tradingPair || 'UNKNOWN/USDT', // Default if not found
          total: totalAmount,
          result: percentValue,
          profit: profit,
          source: `Image ${imageIndex + 1}`,
          percentPosition: { x: percentWord.bbox.x0, y: percentWord.bbox.y0 },
          confidence: Math.round((percentWord.confidence + (potentialTotals[0]?.confidence || 50)) / 2),
          needsCorrection: !tradingPair, // Flag if pair is missing
          method: '%-first'
        };
        
        console.log(`✅ Created %-first trade: ${tradingPair || 'UNKNOWN'} | ${totalAmount} | ${percentValue}% | ${profit.toFixed(4)}`);
        trades.push(trade);
      } else {
        console.log(`❌ Incomplete %-first: ${percentValue}% found, Total: ${totalAmount}`);
      }
    }
    
    // Remove duplicates (same % and total)
    const uniqueTrades = [];
    for (const trade of trades) {
      const isDuplicate = uniqueTrades.some(existing => 
        Math.abs(existing.result - trade.result) < 0.01 && 
        Math.abs(existing.total - trade.total) < 0.01
      );
      if (!isDuplicate) {
        uniqueTrades.push(trade);
      }
    }
    
    console.log(`🎯 %-first strategy found ${uniqueTrades.length} unique trades`);
    return uniqueTrades;
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
        preserve_interword_spaces: '1'
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
        
        // Get detailed OCR result
        const ocrResult = await worker.recognize(canvas);
        
        // %-First parsing
        const trades = parsePercentageFirst(ocrResult, i);
        allTrades.push(...trades);
        
        allRawData.push({
          imageIndex: i,
          text: ocrResult.data.text,
          words: ocrResult.data.words,
          confidence: ocrResult.data.confidence,
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
    setShowCorrection(true);
  };

  // Quick edit functions
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
            📊 %-First SELL Analyzer
          </h1>
          <p className="text-xl text-gray-300">
            % jsou vždy → Najdi Total → Spočítej Profit → Přiřaď Pair
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
                <div className="text-6xl animate-spin">📊</div>
                <h3 className="text-2xl font-semibold">
                  %-First parsing {progress.current}/{progress.total}...
                </h3>
                <div className="w-full bg-gray-700 rounded-full h-4">
                  <div 
                    className="bg-gradient-to-r from-red-500 to-red-600 h-4 rounded-full transition-all duration-300" 
                    style={{ width: `${progress.percent}%` }}
                  ></div>
                </div>
                <div className="text-lg">{progress.percent}% - Hledám % symboly...</div>
              </div>
            ) : (
              <div>
                <div className="text-8xl mb-6">📊💰📊</div>
                <h3 className="text-2xl font-semibold mb-4">%-First Strategy</h3>
                <div className="bg-gradient-to-r from-green-900/50 to-blue-900/50 rounded-lg p-6 mb-4">
                  <p className="text-white font-semibold mb-3">📊 Logická strategie:</p>
                  <div className="text-left text-sm space-y-2">
                    <div>1. 📈 Najdi všechna % (nejspolehlivější element)</div>
                    <div>2. 💰 Pro každé % najdi nejbližší Total amount vlevo</div>
                    <div>3. 💎 Spočítej Profit = Total × % ÷ 100</div>
                    <div>4. 🔗 Pokus se přiřadit Trading Pair (nemusí být 100%)</div>
                  </div>
                </div>
                <p className="text-gray-300 text-lg mb-4">
                  <strong>% jsou vždy přítomny a spolehlivé</strong>
                </p>
                <p className="text-gray-400">
                  Nahrajte screenshoty pro %-first parsing
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

        {/* Debug Mode Toggle */}
        {rawOcrData.length > 0 && (
          <div className="text-center mb-6">
            <button
              onClick={() => setDebugMode(!debugMode)}
              className="px-6 py-2 bg-purple-600 rounded-lg hover:bg-purple-500"
            >
              📈 {debugMode ? 'Skrýt' : 'Zobrazit'} %-First Debug
            </button>
          </div>
        )}

        {/* Debug Information */}
        {debugMode && rawOcrData.length > 0 && (
          <div className="bg-white/10 rounded-2xl p-6 mb-8 backdrop-blur-sm border border-white/20">
            <h3 className="text-xl font-semibold mb-4">📈 %-First Debug Information</h3>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {rawOcrData.map((result, idx) => (
                <div key={idx} className="bg-black/30 rounded-lg p-4">
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold">Image {result.imageIndex + 1}</span>
                    <span className="text-sm text-gray-400">
                      {result.trades.length} % matches found
                    </span>
                  </div>
                  
                  {result.trades.map((trade, tradeIdx) => (
                    <div key={tradeIdx} className="bg-white/5 rounded p-3 mb-2">
                      <div className="text-sm">
                        <div className="text-yellow-300">
                          <strong>% at position:</strong> x={trade.percentPosition.x}, y={trade.percentPosition.y}
                        </div>
                        <div className="text-green-300">
                          <strong>%-First extraction:</strong> {trade.result}% → {trade.total} → {trade.profit.toFixed(4)}
                        </div>
                        <div className="text-blue-300">
                          <strong>Final result:</strong> {trade.pair} | {trade.total} | {trade.result}% | Conf: {trade.confidence}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Correction Interface */}
        {showCorrection && trades.length > 0 && (
          <div className="bg-white/10 rounded-2xl p-6 mb-8 backdrop-blur-sm border border-white/20">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-semibold">✏️ %-First Results</h3>
                {needsCorrection > 0 && (
                  <p className="text-yellow-400 text-sm">⚠️ {needsCorrection} párů potřebuje doporučit</p>
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
                      ? 'bg-blue-900/20 border-blue-500' 
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  {editingTrade?.id === trade.id ? (
                    // Edit mode
                    <div className="space-y-4">
                      <div className="text-xs text-gray-400 mb-2">
                        %-First method • {trade.result}% at ({trade.percentPosition.x}, {trade.percentPosition.y})
                      </div>
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
                    </div>
                  ) : (
                    // View mode
                    <div className="space-y-2">
                      <div className="text-xs text-gray-400">
                        %-First: {trade.result}% → Total: {trade.total} → Profit: {trade.profit.toFixed(4)} • Conf: {trade.confidence}%
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                        <div className={`font-bold ${trade.needsCorrection ? 'text-yellow-400' : 'text-red-400'}`}>
                          {trade.pair}
                          {trade.needsCorrection && <span className="text-xs ml-1">⚠️</span>}
                        </div>
                        <div className="font-mono font-semibold">{trade.total.toFixed(4)}</div>
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
              <div className="text-red-100">%-First matches</div>
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
              📊 Zobrazit %-First results
            </button>
          )}
        </div>

        {/* Final Results Table */}
        {trades.length > 0 && (
          <div className="bg-white/10 rounded-2xl overflow-hidden backdrop-blur-sm border border-white/20 shadow-2xl">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6">
              <h2 className="text-2xl font-bold text-center">
                📊 %-First Extracted Trades
              </h2>
              <p className="text-center text-red-100 text-sm mt-2">
                Začali jsme s % → našli Total → spočítali Profit → přiřadili Pair
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
                    <div className="text-xs text-gray-400">%-First • Conf: {trade.confidence}%</div>
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
          <p>📊 %-First strategy • Percentage-driven extraction • Most reliable approach</p>
        </div>
      </div>
    </div>
  );
};

export default SellAnalyzer;
