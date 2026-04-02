import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Users, ListOrdered, Copy, CheckCircle2, Share2 } from 'lucide-react';

export default function SessionOwner() {
  const { id, ownerId } = useParams<{ id: string; ownerId: string }>();
  const [session, setSession] = useState<any>(null);
  const [view, setView] = useState<'summary' | 'individual'>('summary');
  const [socket, setSocket] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/sessions/${id}/owner/${ownerId}`)
      .then((res) => res.json())
      .then((data) => setSession(data))
      .catch((err) => console.error(err));

    const newSocket = io();
    setSocket(newSocket);
    newSocket.emit('join_session', id);

    newSocket.on('session_updated', (updatedSession) => {
      setSession(updatedSession);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [id, ownerId]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/session/${id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseSession = () => {
    if (window.confirm('確定要結束此訂單嗎？結束後將無法再新增餐點。')) {
      socket?.emit('close_session', { sessionId: id, ownerId });
    }
  };

  if (!session) {
    return <div className="min-h-screen flex items-center justify-center">載入儀表板中...</div>;
  }

  const totalAmount = session.items.reduce((sum: number, item: any) => sum + item.totalPrice, 0);
  const totalItems = session.items.length;

  // Generate Summary
  const summary: Record<string, { count: number; customizations: Record<string, number> }> = {};
  session.items.forEach((item: any) => {
    const key = item.itemName;
    if (!summary[key]) {
      summary[key] = { count: 0, customizations: {} };
    }
    summary[key].count += 1;

    const customKey = item.selections
      .map((s: any) => `${s.categoryName}: ${s.optionName}`)
      .join(', ') + (item.note ? ` (備註：${item.note})` : '');

    const finalKey = customKey || '標準 / 無客製化';

    if (!summary[key].customizations[finalKey]) {
      summary[key].customizations[finalKey] = 0;
    }
    summary[key].customizations[finalKey] += 1;
  });

  // Group by participant
  const byParticipant: Record<string, { items: any[]; total: number }> = {};
  session.items.forEach((item: any) => {
    if (!byParticipant[item.participantName]) {
      byParticipant[item.participantName] = { items: [], total: 0 };
    }
    byParticipant[item.participantName].items.push(item);
    byParticipant[item.participantName].total += item.totalPrice;
  });

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="bg-white sticky top-0 z-10 shadow-sm px-4 py-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-stone-800">訂單儀表板</h1>
            <p className="text-stone-500">
              {session.status === 'open' ? '開放點餐中...' : '訂單已結束'}
            </p>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <button
              onClick={handleCopyLink}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-700 py-2 px-4 rounded-xl font-medium transition-colors"
            >
              {copied ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Share2 className="w-5 h-5" />}
              {copied ? '已複製！' : '分享連結'}
            </button>
            {session.status === 'open' && (
              <button
                onClick={handleCloseSession}
                className="flex-1 sm:flex-none bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-xl font-medium transition-colors"
              >
                結束訂單
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 mt-6">
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
            <p className="text-stone-500 font-medium mb-1">總品項數</p>
            <p className="text-4xl font-bold text-stone-800">{totalItems}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
            <p className="text-stone-500 font-medium mb-1">總金額</p>
            <p className="text-4xl font-bold text-orange-500">${totalAmount}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6 bg-stone-200/50 p-1 rounded-2xl w-fit">
          <button
            onClick={() => setView('summary')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all ${
              view === 'summary' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <ListOrdered className="w-5 h-5" />
            點餐彙整
          </button>
          <button
            onClick={() => setView('individual')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all ${
              view === 'individual' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <Users className="w-5 h-5" />
            個人明細
          </button>
        </div>

        {view === 'summary' ? (
          <div className="space-y-4">
            {Object.entries(summary).map(([itemName, data]) => (
              <div key={itemName} className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-stone-100">
                  <h3 className="text-xl font-bold text-stone-800">{itemName}</h3>
                  <span className="bg-stone-100 text-stone-800 font-bold px-4 py-1 rounded-full text-lg">
                    x{data.count}
                  </span>
                </div>
                {Object.keys(data.customizations).length > 0 ? (
                  <ul className="space-y-3">
                    {Object.entries(data.customizations).map(([custom, count]) => (
                      <li key={custom} className="flex justify-between items-start text-stone-600 bg-stone-50 p-3 rounded-xl">
                        <span className="flex-1 pr-4">{custom || '標準 / 無客製化'}</span>
                        <span className="font-bold text-stone-800 bg-white px-3 py-1 rounded-lg shadow-sm">x{count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-stone-400 italic">無客製化選項</p>
                )}
              </div>
            ))}
            {Object.keys(summary).length === 0 && (
              <div className="text-center py-12 text-stone-400">目前尚未有人點餐。</div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byParticipant).map(([name, data]) => (
              <div key={name} className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-stone-100">
                  <h3 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                    <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    {name}
                  </h3>
                  <span className="text-xl font-bold text-orange-500">${data.total}</span>
                </div>
                <ul className="space-y-4">
                  {data.items.map((item, idx) => (
                    <li key={idx} className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-stone-700">{item.itemName}</p>
                        <p className="text-sm text-stone-500 mt-1">
                          {item.selections.map((s: any) => `${s.categoryName}: ${s.optionName}`).join(', ')}
                        </p>
                        {item.note && <p className="text-sm text-stone-400 italic mt-1">備註：{item.note}</p>}
                      </div>
                      <span className="font-medium text-stone-600">${item.totalPrice}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {Object.keys(byParticipant).length === 0 && (
              <div className="text-center py-12 text-stone-400">目前尚未有參與者。</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
