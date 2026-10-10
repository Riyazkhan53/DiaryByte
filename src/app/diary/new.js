import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import Header from '../../components/Header';
import MoodPicker from '../../components/MoodPicker';
import CategoryPicker from '../../components/CategoryPicker';
import { useTheme } from '../../hooks/useTheme';
import { addEntry } from '../../utils/storage';

export default function NewEntryScreen() {
  const { theme } = useTheme();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState(null);
  const [category, setCategory] = useState(null);
  const [imageUri, setImageUri] = useState(null);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      const uri = asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : asset.uri;
      setImageUri(uri);
    }
  };

  const handleSave = async () => {
    if (!content.trim()) return;

    const newEntry = {
      id: Date.now().toString(),
      title: title.trim() || 'Untitled Entry',
      content: content.trim(),
      mood,
      category,
      imageUri,
      date: new Date().toISOString(),
    };

    await addEntry(newEntry);
    router.replace('/');
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Header
        title="New Entry"
        subtitle="Capture your thoughts"
        showBack
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView
          style={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          <MoodPicker selected={mood} onSelect={setMood} />
          <CategoryPicker selected={category} onSelect={setCategory} />

          <Text style={[styles.label, { color: theme.textSecondary }]}>
            Title
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderNeutral,
                color: theme.text,
              },
            ]}
            placeholder="Give your entry a title..."
            placeholderTextColor={theme.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>
            Entry
          </Text>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderNeutral,
                color: theme.text,
              },
            ]}
            placeholder="What's on your mind today?"
            placeholderTextColor={theme.textMuted}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[
              styles.imageButton,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderNeutral,
              },
            ]}
            onPress={pickImage}
            activeOpacity={0.7}
          >
            <Ionicons
              name="image-outline"
              size={22}
              color={theme.textSecondary}
            />
            <Text style={[styles.imageButtonText, { color: theme.textSecondary }]}>
              {imageUri ? 'Change Photo' : 'Add Photo'}
            </Text>
          </TouchableOpacity>

          {imageUri && (
            <View style={styles.previewContainer}>
              <Image source={{ uri: imageUri }} style={styles.preview} />
              <TouchableOpacity
                style={[
                  styles.removeImage,
                  { backgroundColor: theme.danger },
                ]}
                onPress={() => setImageUri(null)}
              >
                <Ionicons name="close" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.cancelButton,
                { backgroundColor: theme.surfaceAlt },
              ]}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.cancelButtonText,
                  { color: theme.textSecondary },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveButton,
                {
                  backgroundColor: content.trim()
                    ? theme.primary
                    : theme.primaryDark + '80',
                },
              ]}
              onPress={handleSave}
              disabled={!content.trim()}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.saveButtonText,
                  { color: theme.text },
                ]}
              >
                Save Entry
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  form: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
  },
  textArea: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    minHeight: 180,
    maxHeight: 320,
  },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    marginTop: 16,
  },
  imageButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  previewContainer: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  preview: {
    width: 200,
    height: 150,
    borderRadius: 12,
  },
  removeImage: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 40,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
