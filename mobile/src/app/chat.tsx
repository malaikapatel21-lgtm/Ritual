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
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { usePodMembership } from "@/lib/usePodMembership";
import type { Message } from "@/lib/types";

export default function Chat() {
  const { session } = useAuth();
  const { loading: membershipLoading, status, ritual, podId, members } = usePodMembership();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

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
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (status !== "matched" || !podId) {
    return (
      <View style={styles.center}>
        <Text style={styles.subtitle}>Chat opens once you're matched into a pod.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={64}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>{ritual?.ritual_type} pod</Text>
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
        data={messages}
        keyExtractor={(item) => item.id}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={styles.messageRow}>
            <Text style={styles.sender}>{nameFor(item.user_id)}</Text>
            <Text style={styles.messageBody}>{item.body}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.subtitle}>No messages yet — say hi!</Text>}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Message your pod…"
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <Pressable
          style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
          disabled={!draft.trim() || sending}
          onPress={send}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  back: { color: "#666", fontSize: 15 },
  title: { fontSize: 18, fontWeight: "700", textTransform: "capitalize" },
  subtitle: { fontSize: 15, color: "#666", textAlign: "center", marginTop: 24 },
  list: { flex: 1, paddingHorizontal: 16 },
  messageRow: { marginBottom: 12 },
  sender: { fontSize: 12, color: "#666", marginBottom: 2 },
  messageBody: { fontSize: 16 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: "#2f6f4f",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: "#fff", fontWeight: "600" },
});
