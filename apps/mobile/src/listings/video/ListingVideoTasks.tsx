import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import type { VideoUploadsSchemas } from "@auto-tm/contracts";

import { useAuth } from "../../auth/useAuth";

import { useListingVideoPreparation, type UseListingVideoPreparationOptions } from "./videoPreparation";
import { useVideoUpload, type UseVideoUploadOptions } from "./videoUpload";

type Target = VideoUploadsSchemas.VideoUploadTarget;
export interface ListingVideoTaskOptions extends UseListingVideoPreparationOptions, Omit<UseVideoUploadOptions, "fileSystem"> { uploadFileSystem?: UseVideoUploadOptions["fileSystem"] }

/** Preparation and upload outlive Photos, Review, and navigation after publish. */
export function useLocalListingVideoTask(options: ListingVideoTaskOptions) {
  const prep = useListingVideoPreparation(options);
  const cancel = prep.cancel;
  useEffect(() => () => cancel(), [cancel]);
  const upload = useVideoUpload({ ...options, fileSystem: options.uploadFileSystem });
  useEffect(() => {
    if (prep.state.phase !== "prepared" || !options.target || upload.state.phase !== "idle") return;
    prep.handoff();
    void upload.start(prep.state.file, prep.state.selection);
    prep.remove();
  }, [prep, upload, options.target]);
  return useMemo(() => ({ prep, upload }), [prep, upload]);
}
export type ListingVideoTask = ReturnType<typeof useLocalListingVideoTask>;

const keyOf = (target: Target) => `${target.type}:${target.id}`;
interface TaskEntry { options: ListingVideoTaskOptions; task?: ListingVideoTask }
interface Tasks {
  entries: Record<string, TaskEntry>;
  ensure(options: ListingVideoTaskOptions & { target: Target }): void;
  published(draftId: string, listingId: string): void;
}
const Context = createContext<Tasks | null>(null);

function Runner({ options, report }: { options: ListingVideoTaskOptions; report(task: ListingVideoTask): void }) {
  const task = useLocalListingVideoTask(options);
  useEffect(() => report(task), [task, report]);
  return null;
}

export function ListingVideoTasksProvider({ children }: PropsWithChildren) {
  const { userId } = useAuth();
  // Changing account unmounts every runner and hides its private state immediately.
  return <UserTasks key={userId ?? "anonymous"} userId={userId}>{children}</UserTasks>;
}
function UserTasks({ children, userId }: PropsWithChildren<{ userId: string | null }>) {
  const [entries, setEntries] = useState<Record<string, TaskEntry>>({});
  const ensure = useCallback((options: ListingVideoTaskOptions & { target: Target }) => {
    const key = keyOf(options.target);
    setEntries((current) => current[key] || Object.values(current).some((entry) => entry.options.target && keyOf(entry.options.target) === key) ? current : { ...current, [key]: { options } });
  }, []);
  const published = useCallback((draftId: string, listingId: string) => {
    void entries[keyOf({ type: "draft", id: draftId })]?.task?.upload.adopt({ type: "listing", id: listingId })?.catch(() => undefined);
    setEntries((current) => {
      const oldKey = keyOf({ type: "draft", id: draftId });
      const entry = current[oldKey];
      if (!entry) return current;
      // The runner keeps its key, native job and upload controller. Only future
      // session opens use the canonical Listing; existing session IDs stay valid.
      return { ...current, [oldKey]: { ...entry, options: { ...entry.options, target: { type: "listing", id: listingId } } } };
    });
  }, [entries]);
  const context = useMemo(() => ({ entries, ensure, published }), [entries, ensure, published]);
  return <Context.Provider value={context}>
    {Object.entries(entries).map(([key, entry]) => <TaskRunner key={key} entryKey={key} entry={entry} setEntries={setEntries} userId={userId} />)}
    {children}
  </Context.Provider>;
}
function TaskRunner({ entryKey, entry, setEntries, userId }: { userId: string | null; entryKey: string; entry: TaskEntry; setEntries: React.Dispatch<React.SetStateAction<Record<string, TaskEntry>>> }) {
  const report = useCallback((task: ListingVideoTask) => setEntries((current) => {
    const entry = current[entryKey];
    return entry ? { ...current, [entryKey]: { ...entry, task } } : current;
  }), [entryKey, setEntries]);
  return <Runner options={{ ...entry.options, storageKey: `listing-video:${userId}:${entryKey}` }} report={report} />;
}
export function useListingVideoTasks() { return useContext(Context); }
export function useExistingListingVideoTask(target: Target) {
  const tasks = useContext(Context);
  return tasks ? Object.values(tasks.entries).find((entry) => entry.options.target && keyOf(entry.options.target) === keyOf(target))?.task : undefined;
}
export function useSharedListingVideoTask(options: ListingVideoTaskOptions) {
  const tasks = useContext(Context);
  const target = options.target;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const ensure = tasks?.ensure;
  const type = target?.type, id = target?.id;
  useEffect(() => { if (type && id) ensure?.({ ...optionsRef.current, target: { type, id } }); }, [ensure, type, id]);
  return tasks && target ? Object.values(tasks.entries).find((entry) => entry.options.target && keyOf(entry.options.target) === keyOf(target))?.task : undefined;
}
