import { useState, useCallback } from 'react';
import { StyleSheet, View, SafeAreaView, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Header from '../../components/Header';
import Notebook from '../../components/diary/Notebook';
import { useTheme } from '../../hooks/useTheme';
import { addEntry, deleteEntry, loadEntries, pullEntries, updateEntry } from '../../utils/storage';

/** Personal Diary: a notebook (cover, index, ruled handwritten pages). */
export default function HomeScreen() {
  const { userName } = useTheme();
  const [entries, setEntries] = useState([]);
  const [pulling, setPulling] = useState(false);

  const pullFromServerNow = useCallback(async () => {
    setPulling(true);
    try {
      setEntries(await pullEntries());
    } catch (error) {
      Alert.alert('Sync failed', error.message || 'Could not reach the server.');
    } finally {
      setPulling(false);
    }
  }, []);

  // Reload on focus so notes changed elsewhere (calendar, sync) show up.
  useFocusEffect(
    useCallback(() => {
      loadEntries().then(setEntries);
    }, [])
  );

  const saveNote = async (note, isNew) => {
    if (isNew) {
      setEntries(
        await addEntry({ ...note, id: Date.now().toString(), date: new Date().toISOString(), category: 'personal' })
      );
    } else {
      setEntries(await updateEntry(note));
    }
  };

  const removeNote = async (id) => setEntries(await deleteEntry(id));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="DiaryByte" subtitle="Your personal diary" />
      <View style={styles.content}>
        <Notebook
          entries={entries}
          userName={userName}
          onSave={saveNote}
          onDelete={removeNote}
          onOpenCalendar={() => router.push('/diary/calendar')}
          onPull={pullFromServerNow}
          pulling={pulling}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingBottom: 8 },
});
