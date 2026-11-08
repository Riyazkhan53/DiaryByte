import { SafeAreaView, StyleSheet } from 'react-native';
import Header from '../../components/Header';
import AiChat from '../../components/ai/AiChat';

/** InvestByte AI: reviews My Investments and suggests what to sell, keep or change. */
export default function InvestByteScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Header title="InvestByte AI" subtitle="Your portfolio, reviewed" showBack />
      <AiChat
        kind="invest"
        title="InvestByte AI"
        tagline="Reads your holdings, fund returns and stock trends, then suggests what to sell, keep or improve."
        icon="analytics"
        gradient={['#0EA5A4', '#059669']}
        thinkingText="Going through your portfolio…"
        suggestions={[
          'Review my whole portfolio',
          'Is there anything I should sell or trim?',
          'Is my allocation balanced across equity, gold and debt?',
          'Which SIP should I increase, cut or stop?',
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
});
