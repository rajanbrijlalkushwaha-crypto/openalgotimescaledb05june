export default function Footer() {
  const text =
    '⚠️ DISCLAIMER: The information, tools, and data on SOC – Simplify Option Chain (soc.ai.in) are for educational and analytical purposes only. SOC does not provide investment advice or trading recommendations. All trading decisions are solely at the user\'s own risk. Financial markets involve substantial risk — consult a qualified financial advisor before investing. SOC and its affiliates are not responsible for any financial losses resulting from the use of this platform. By using soc.ai.in you agree to the terms and conditions. ' +
    '⚠️ अस्वीकरण: soc.ai.in पर उपलब्ध जानकारी केवल शैक्षिक व विश्लेषणात्मक उद्देश्यों के लिए है। SOC कोई निवेश सलाह या ट्रेडिंग सिफारिश नहीं देता। सभी ट्रेडिंग निर्णय उपयोगकर्ता की अपनी जिम्मेदारी पर हैं। किसी भी निवेश से पहले योग्य वित्तीय सलाहकार से परामर्श करें। SOC किसी भी वित्तीय नुकसान के लिए जिम्मेदार नहीं होगा। soc.ai.in का उपयोग करके आप इस अस्वीकरण से सहमत होते हैं। \u00a0\u00a0\u00a0\u00a0\u00a0\u00a0';

  return (
    <div className="disclaimer-bar">
      <div className="disclaimer-track">
        <span>{text}</span>
        <span aria-hidden="true">{text}</span>
      </div>
    </div>
  );
}
