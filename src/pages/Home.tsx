import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, Loader2, Utensils } from 'lucide-react';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
        const base64 = reader.result as string;
        const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');

        const res = await fetch('/api/parse-menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64Data, mimeType: file.type }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || '菜單解析失敗，請稍後再試。');
        }

        const { sessionId, ownerId } = await res.json();
        navigate(`/session/${sessionId}/owner/${ownerId}`);
        } catch (err: any) {
          console.error("API Error:", err);
          const errorString = err instanceof Error ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err));

          if (errorString.includes('429') || errorString.includes('quota') || errorString.includes('RESOURCE_EXHAUSTED')) {
            setError('目前系統使用人數較多，已達到 AI 服務的用量上限 (Quota Exceeded)。請稍後再試，或檢查您的 API 配額。');
          } else {
            setError(err instanceof Error ? err.message : '發生錯誤，請稍後再試。');
          }
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError('發生錯誤，請稍後再試。');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center">
        <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Utensils className="w-10 h-10 text-orange-500" />
        </div>
        <h1 className="text-3xl font-bold text-stone-800 mb-2">AI 智能訂餐</h1>
        <p className="text-stone-500 mb-8">上傳菜單，立即發起多人訂餐。</p>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-orange-500 hover:bg-orange-600 text-white py-4 px-6 rounded-2xl font-semibold transition-colors disabled:opacity-70"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Camera className="w-6 h-6" />
                開啟相機拍照
              </>
            )}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-stone-100 hover:bg-stone-200 text-stone-700 py-4 px-6 rounded-2xl font-semibold transition-colors disabled:opacity-70"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Upload className="w-6 h-6" />
                從本機 / 相簿上傳
              </>
            )}
          </button>
          
          <input
            type="file"
            accept="image/*"
            capture={isMobile ? "environment" : "user"}
            ref={cameraInputRef}
            onChange={handleFileChange}
            className="hidden"
          />

          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}
