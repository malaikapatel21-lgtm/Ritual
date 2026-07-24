import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import Animated, { FadeInUp } from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { usePodMembership } from "@/lib/usePodMembership";
import type { Message } from "@/lib/types";
import { Screen } from "@/components/Screen";
import { accentForRitual, colors, fonts } from "@/lib/theme";
import { hapticTap } from "@/lib/haptics";

export default function Chat() {
  const { session } = useAuth();
  const { loading: membershipLoading, status, ritual, podId, members } = usePodMembership();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const accent = accentForRitual(ritual?.ritual_type);

  const nameFor = (userId: string) => {
    if (userId === session?.user.id) return "You";
    return members.find((m) => m.user_id === userId)?.full_name ?? "A member";
  };

  useEffect(() => {
    if (!podId) return;

    let cancelled = false;

    async function loadMessages() {
      const { data } = await supabase
        .from("messages")
        .select("id, pod_id, user_id, body, created_at")
        .eq("pod_id", podId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!cancelled) {
        setMessages(data ?? []);
        setLoadingMessages(false);
      }
    }
    loadMessages();

    const channel = supabase
      .channel(`messages:${podId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `pod_id=eq.${podId}` },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((current) =>
            current.some((m) => m.id === incoming.id) ? current : [...current, incoming]
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [podId]);

  async function send() {
    const body = draft.trim();
    if (!body || !session || !podId) return;
    hapticTap();
    setSending(true);
    setDraft("");

    const { data, error } = await supabase
      .from("messages")
      .insert({ pod_id: podId, user_id: session.user.id, body })
      .select("id, pod_id, user_id, body, created_at")
      .single();

    setSending(false);

    if (error) {
      setDraft(body);
      return;
    }
    setMessages((current) => (current.some((m) => m.id === data.id) ? current : [...current, data]));
  }

  if (membershipLoading || loadingMessages) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.berry} />
      </Screen>
    );
  }

  if (status !== "matched" || !podId) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.subtitle}>Chat opens once you're matched into a pod.</Text>
      </Screen>
    );
  }

  return (
    <Screen accent={accent}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={64}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.back, { color: accent }]}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>{ritual?.ritual_type} pod</Text>
        </View>

        <FlatList
          ref={listRef}
          style={styles.list}
          data={messages}
          keyExtractor={(item) => item.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isMe = item.user_id === session?.user.id;
            return (
              <Animated.View
                entering={FadeInUp.duration(300)}
                style={[styles.messageRow, isMe && styles.messageRowMine]}
              >
                <View style={[styles.bubble, isMe ? { backgroundColor: accent } : styles.bubbleTheirs]}>
                  {!isMe && <Text style={styles.sender}>{nameFor(item.user_id)}</Text>}
                  <Text style={[styles.messageBody, isMe && styles.messageBodyMine]}>{item.body}</Text>
                </View>
              </Animated.View>
            );
          }}
          ListEmptyComponent={<Text style={styles.subtitle}>No messages yet — say hi!</Text>}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Message your pod…"
            placeholderTextColor={colors.muted}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            style={[styles.sendButton, { backgroundColor: accent }, (!draft.trim() || sending) && styles.sendButtonDisabled]}
            disabled={!draft.trim() || sending}
            onPress={send}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 12 },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  back: { fontSize: 15, fontWeight: "700" },
  title: { fontFamily: fonts.displaySemibold, fontSize: 20, color: colors.ink, textTransform: "capitalize" },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: "center", marginTop: 24 },
  list: { flex: 1, paddingHorizontal: 16 },
  messageRow: { marginBottom: 12, alignItems: "flex-start" },
  messageRowMine: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "80%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sender: { fontSize: 12, color: colors.muted, marginBottom: 2 },
  messageBody: { fontSize: 16, color: colors.ink },
  messageBodyMine: { color: colors.surface },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    fontSize: 16,
    maxHeight: 100,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  sendButton: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: colors.surface, fontWeight: "700" },
});
