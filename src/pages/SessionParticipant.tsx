import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { ShoppingBag, ChevronRight, Check, Plus, Minus, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MenuOption {
  name: string;
  price?: number;
}

interface MenuCategory {
  name: string;
  options: MenuOption[];
  required: boolean;
  multiple: boolean;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  categories: MenuCategory[];
}

export default function SessionParticipant() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<any>(null);
  const [name, setName] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState('');
  const [socket, setSocket] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setSession(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });

    const newSocket = io();
    setSocket(newSocket);
    newSocket.emit('join_session', id);

    newSocket.on('session_updated', (updatedSession) => {
      setSession(updatedSession);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [id]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      setHasJoined(true);
    }
  };

  const handleOptionToggle = (categoryName: string, optionName: string, multiple: boolean) => {
    setSelections((prev) => {
      const current = prev[categoryName] || [];
      if (multiple) {
        return {
          ...prev,
          [categoryName]: current.includes(optionName)
            ? current.filter((o) => o !== optionName)
            : [...current, optionName],
        };
      } else {
        return {
          ...prev,
          [categoryName]: [optionName],
        };
      }
    });
  };

  const calculateItemTotal = () => {
    if (!selectedItem) return 0;
    let total = selectedItem.price || 0;
    (selectedItem.categories || []).filter(Boolean).forEach((cat) => {
      const selectedOpts = selections[cat.name] || [];
      selectedOpts.forEach((optName) => {
        const opt = (cat.options || []).find((o) => o.name === optName);
        if (opt && opt.price) {
          total += opt.price;
        }
      });
    });
    return total;
  };

  const handleAddToCart = () => {
    if (!selectedItem || !socket) return;

    // Validate required categories
    for (const cat of (selectedItem.categories || []).filter(Boolean)) {
      if (cat.required && (!selections[cat.name] || selections[cat.name].length === 0)) {
        alert(`請選擇 ${cat.name} 的選項`);
        return;
      }
    }

    const itemSelections = [];
    for (const cat of (selectedItem.categories || []).filter(Boolean)) {
      const selectedOpts = selections[cat.name] || [];
      for (const optName of selectedOpts) {
        const opt = (cat.options || []).find((o) => o.name === optName);
        itemSelections.push({
          categoryName: cat.name,
          optionName: optName,
          price: opt?.price || 0,
        });
      }
    }

    const orderItem = {
      participantName: name,
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      basePrice: selectedItem.price || 0,
      selections: itemSelections,
      note,
      totalPrice: calculateItemTotal(),
    };

    socket.emit('add_item', { sessionId: id, item: orderItem });
    setSelectedItem(null);
    setSelections({});
    setNote('');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">載入中...</div>;
  }

  if (!session || session.status === 'closed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-sm max-w-md w-full">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Info className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-stone-800 mb-2">訂單已結束</h2>
          <p className="text-stone-500">此訂單已結束或不存在。</p>
        </div>
      </div>
    );
  }

  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center">
          <h1 className="text-3xl font-bold text-stone-800 mb-2">加入訂餐</h1>
          <p className="text-stone-500 mb-8">請輸入您的名字以開始點餐。</p>
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="您的名字"
              className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-stone-50"
              required
            />
            <button
              type="submit"
              className="w-full bg-stone-900 hover:bg-stone-800 text-white py-3 px-6 rounded-xl font-semibold transition-colors"
            >
              開始點餐
            </button>
          </form>
        </div>
      </div>
    );
  }

  const myItems = session.items.filter((i: any) => i.participantName === name);
  const myTotal = myItems.reduce((sum: number, i: any) => sum + i.totalPrice, 0);

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="bg-white sticky top-0 z-10 shadow-sm px-4 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-stone-800">菜單</h1>
          <p className="text-sm text-stone-500">目前點餐者：{name}</p>
        </div>
        <div className="bg-orange-100 text-orange-600 px-4 py-2 rounded-full font-bold flex items-center gap-2">
          <ShoppingBag className="w-5 h-5" />
          ${myTotal}
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {session.menu.map((item: MenuItem) => (
          <div
            key={item.id}
            onClick={() => {
              setSelectedItem(item);
              setSelections({});
              setNote('');
            }}
            className="bg-white p-4 rounded-2xl shadow-sm cursor-pointer hover:shadow-md transition-shadow flex justify-between items-center"
          >
            <div>
              <h3 className="font-bold text-stone-800 text-lg">{item.name}</h3>
              <p className="text-stone-500 font-medium">${item.price || 0}</p>
            </div>
            <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center text-stone-400">
              <Plus className="w-5 h-5" />
            </div>
          </div>
        ))}
      </main>

      {/* Item Customization Modal */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          >
            <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="p-6 border-b border-stone-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <h2 className="text-2xl font-bold text-stone-800">{selectedItem.name}</h2>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-stone-500"
                >
                  &times;
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-8">
                {(selectedItem.categories || []).filter(Boolean).map((cat, index) => (
                  <div key={cat.name || index}>
                    <div className="flex justify-between items-baseline mb-3">
                      <h3 className="font-bold text-stone-800 text-lg">{cat.name}</h3>
                      <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                        {cat.required ? '必選' : '可選'} {cat.multiple ? '(可複選)' : '(單選)'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {(cat.options || []).map((opt, optIndex) => {
                        const isSelected = (selections[cat.name] || []).includes(opt.name);
                        return (
                          <label
                            key={opt.name || optIndex}
                            className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                              isSelected
                                ? 'border-orange-500 bg-orange-50'
                                : 'border-stone-100 bg-white hover:border-stone-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type={cat.multiple ? 'checkbox' : 'radio'}
                                name={cat.name}
                                checked={isSelected}
                                onChange={() => handleOptionToggle(cat.name, opt.name, cat.multiple)}
                                className="hidden"
                              />
                              <div
                                className={`w-5 h-5 flex items-center justify-center rounded ${
                                  cat.multiple ? 'rounded-md' : 'rounded-full'
                                } border-2 ${
                                  isSelected
                                    ? 'border-orange-500 bg-orange-500'
                                    : 'border-stone-300'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <span className={`font-medium ${isSelected ? 'text-orange-900' : 'text-stone-700'}`}>
                                {opt.name}
                              </span>
                            </div>
                            {opt.price ? (
                              <span className="text-stone-500 font-medium">+${opt.price}</span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div>
                  <h3 className="font-bold text-stone-800 text-lg mb-3">特殊需求 / 備註</h3>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="有任何特殊需求嗎？"
                    className="w-full p-4 rounded-xl border-2 border-stone-100 bg-stone-50 focus:bg-white focus:border-orange-500 focus:outline-none resize-none h-24"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-stone-100 bg-white">
                <button
                  onClick={handleAddToCart}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 px-6 rounded-2xl font-bold text-lg flex justify-between items-center transition-colors"
                >
                  <span>加入訂單</span>
                  <span>${calculateItemTotal()}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
