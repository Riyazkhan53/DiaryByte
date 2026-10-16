import { StyleSheet, Text, View, TouchableOpacity, FlatList } from 'react-native';
import { useTheme } from '../hooks/useTheme';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CalendarView({ entries, selectedDate, onSelectDate }) {
  const { theme } = useTheme();

  const today = new Date();
  const year = selectedDate ? new Date(selectedDate).getFullYear() : today.getFullYear();
  const month = selectedDate ? new Date(selectedDate).getMonth() : today.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const entryDates = new Set(
    entries.map((entry) => entry.date.split('T')[0])
  );

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    days.push({ day: i, dateString });
  }

  const isSelected = (dateString) => {
    if (!selectedDate) return false;
    return dateString === selectedDate;
  };

  const monthName = new Date(year, month).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            const prev = new Date(year, month - 1, 1);
            onSelectDate(prev.toISOString().split('T')[0]);
          }}
        >
          <Text style={[styles.nav, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.month, { color: theme.text }]}>{monthName}</Text>
        <TouchableOpacity
          onPress={() => {
            const next = new Date(year, month + 1, 1);
            onSelectDate(next.toISOString().split('T')[0]);
          }}
        >
          <Text style={[styles.nav, { color: theme.text }]}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekDays}>
        {DAYS.map((day, index) => (
          <Text
            key={index}
            style={[styles.weekDay, { color: theme.textMuted }]}
          >
            {day}
          </Text>
        ))}
      </View>

      <FlatList
        data={days}
        numColumns={7}
        keyExtractor={(item, index) => index.toString()}
        scrollEnabled={false}
        renderItem={({ item }) => {
          if (!item) {
            return <View style={styles.dayCell} />;
          }
          const hasEntry = entryDates.has(item.dateString);
          const selected = isSelected(item.dateString);
          return (
            <TouchableOpacity
              style={[
                styles.dayCell,
                selected && {
                  backgroundColor: theme.primary,
                  borderRadius: 10,
                },
              ]}
              onPress={() => onSelectDate(selected ? null : item.dateString)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayText,
                  { color: selected ? theme.text : theme.textSecondary },
                ]}
              >
                {item.day}
              </Text>
              {hasEntry && (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: selected ? theme.text : theme.secondary },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  nav: {
    fontSize: 24,
    paddingHorizontal: 12,
  },
  month: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Header letters and day cells share the same 1/7 width so columns line up.
  weekDays: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDay: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  dayText: {
    fontSize: 14,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 2,
  },
});
