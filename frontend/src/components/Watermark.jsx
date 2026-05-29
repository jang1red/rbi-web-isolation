// 워터마크 오버레이 — 소개서의 "웹 배경화면을 추가하여 내부 유출을 방지하는 워터마크".
// 격리 화면(iframe) 위에 반복 텍스트를 깔아 화면 캡처/촬영 시 사용자·시각 추적이 가능.
// pointer-events:none 으로 사용자의 조작을 방해하지 않음.
export default function Watermark({ text, opacity = 0.12 }) {
  if (!text) return null;
  const tile = (
    <span style={{ display: 'inline-block', transform: 'rotate(-30deg)', whiteSpace: 'nowrap',
                   padding: '40px 60px', color: '#000', fontSize: 14, fontWeight: 600 }}>
      {text}
    </span>
  );
  return (
    <div className="watermark" style={{ opacity }} aria-hidden>
      {Array.from({ length: 200 }).map((_, i) => <span key={i}>{tile}</span>)}
    </div>
  );
}
