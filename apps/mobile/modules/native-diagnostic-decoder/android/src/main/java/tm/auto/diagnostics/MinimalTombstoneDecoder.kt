package tm.auto.diagnostics

import java.io.ByteArrayInputStream
import java.io.InputStream
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets

/** Pure parser for the public Android tombstone.proto fields used by the app-owned contract. */
object MinimalTombstoneDecoder {
    const val MAX_BYTES = 2 * 1024 * 1024
    const val MAX_DEPTH = 16
    const val MAX_FRAMES = 50
    const val MAX_MODULES = 16

    data class ModuleManifest(val path: String, val alias: String, val buildId: String, val appOwned: Boolean)
    data class Manifest(val abi: String, val modules: List<ModuleManifest>)
    data class Frame(val module: String, val relativePc: String)
    data class Result(val architecture: String, val signalNumber: Int, val signalCode: Int, val crashingTid: Long, val modules: List<ModuleManifest>, val frames: List<Frame>)

    fun decode(input: InputStream, manifest: Manifest): Result? = try {
        val limited = CountingInput(input)
        val root = Message(limited, 0).parseRoot()
        if (limited.count > MAX_BYTES || root.tid == null || root.tid!! <= 0L || root.signalNumber == null || root.signalCode == null || root.signalNumber!! !in 1..64) return null
        val arch = mapOf(0L to "armeabi-v7a", 1L to "arm64-v8a", 2L to "x86", 3L to "x86_64")[root.arch] ?: return null
        if (arch != manifest.abi || root.threads[root.tid] == null) return null
        val thread = root.threads[root.tid]!!
        val byPath = manifest.modules.associateBy { it.path }
        if (byPath.size != manifest.modules.size || manifest.modules.size > MAX_MODULES) return null
        val used = linkedMapOf<String, ModuleManifest>()
        val frames = ArrayList<Frame>()
        for (raw in thread.frames) {
            val module = byPath[raw.path] ?: continue
            if (!module.appOwned || module.buildId != raw.buildId) continue
            if (used.putIfAbsent(module.alias, module) == null && used.size > MAX_MODULES) return null
            if (frames.size < MAX_FRAMES) frames += Frame(module.alias, raw.relativePc)
        }
        if (frames.isEmpty() || used.isEmpty()) return null
        Result(arch, root.signalNumber!!, root.signalCode!!, root.tid!!, used.values.toList(), frames)
    } catch (_: ParseFailure) { null }

    fun decode(bytes: ByteArray, manifest: Manifest): Result? = decode(ByteArrayInputStream(bytes), manifest)

    private class CountingInput(private val source: InputStream) : InputStream() {
        var count = 0
        private var pushed = -1
        fun hasNext(): Boolean { if (pushed >= 0) return true; pushed = source.read(); return pushed >= 0 }
        override fun read(): Int { val value = if (pushed >= 0) pushed.also { pushed = -1 } else source.read(); if (value >= 0 && ++count > MAX_BYTES) throw ParseFailure(); return value }
        override fun read(b: ByteArray, off: Int, len: Int): Int { if (pushed >= 0) { b[off] = read().toByte(); return 1 }; val n = source.read(b, off, len); if (n > 0) { count += n; if (count > MAX_BYTES) throw ParseFailure() }; return n }
    }
    private class ParseFailure : RuntimeException()
    private class Message(private val input: CountingInput, private val depth: Int) {
        data class RawFrame(val path: String, val buildId: String, val relativePc: String)
        data class Thread(val frames: MutableList<RawFrame> = mutableListOf())
        data class Root(var arch: Long? = null, var tid: Long? = null, var signalNumber: Int? = null, var signalCode: Int? = null, val threads: MutableMap<Long, Thread> = linkedMapOf())
        fun parseRoot(): Root { val root = Root(); var seen = mutableSetOf<Int>(); while (input.hasNext()) { val tag = key(); if (!seen.add(tag.field) && tag.field in setOf(1, 6, 10)) throw ParseFailure(); when (tag.field) { 1 -> root.arch = value(tag.type); 6 -> root.tid = value(tag.type); 10 -> parseSignal(bytes(tag.type), root); 16 -> parseThreadEntry(bytes(tag.type), root); else -> skip(tag.type) } }; return root }
        private fun parseSignal(data: ByteArray, root: Root) { val m = Message(CountingInput(ByteArrayInputStream(data)), depth + 1); if (depth >= MAX_DEPTH) throw ParseFailure(); var n: Int? = null; var c: Int? = null; while (m.input.hasNext()) { val t=m.key(); when(t.field) { 1 -> { if(n!=null) throw ParseFailure(); n=m.value(t.type).let { if (it !in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) throw ParseFailure() else it.toInt() } }; 3 -> { if(c!=null) throw ParseFailure(); c=m.value(t.type).let { if (it !in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()) throw ParseFailure() else it.toInt() } }; else -> m.skip(t.type) } }; root.signalNumber=n; root.signalCode=c }
        private fun parseThreadEntry(data: ByteArray, root: Root) { if (depth >= MAX_DEPTH) throw ParseFailure(); val m=Message(CountingInput(ByteArrayInputStream(data)), depth+1); var key: Long?=null; var thread: Thread?=null; while(m.input.hasNext()){ val t=m.key(); when(t.field){1->{if(key!=null)throw ParseFailure();key=m.value(t.type)};2->{if(thread!=null)throw ParseFailure();thread=m.parseThread(m.bytes(t.type))};else->m.skip(t.type)}}; if(key==null||thread==null||root.threads.put(key!!,thread!!)!=null)throw ParseFailure() }
        private fun parseThread(data: ByteArray): Thread { val m=Message(CountingInput(ByteArrayInputStream(data)), depth+1); val out=Thread(); while(m.input.hasNext()){val t=m.key(); if(t.field==4){if(out.frames.size>=MAX_FRAMES)throw ParseFailure();out.frames+=m.parseFrame(m.bytes(t.type))}else m.skip(t.type)};return out }
        private fun parseFrame(data: ByteArray): RawFrame { if (depth >= MAX_DEPTH) throw ParseFailure(); val m=Message(CountingInput(ByteArrayInputStream(data)), depth+1); var pc:Long?=null;var path:String?=null;var id:String?=null;while(m.input.hasNext()){val t=m.key();when(t.field){1->{if(pc!=null)throw ParseFailure();pc=m.value(t.type)};6->{if(path!=null)throw ParseFailure();path=m.text(t.type)};8->{if(id!=null)throw ParseFailure();id=m.text(t.type)};else->m.skip(t.type)}};if(pc==null||path==null||id==null||id.isEmpty()||!id.matches(Regex("[0-9a-fA-F]{8,128}")))throw ParseFailure();return RawFrame(path,id.lowercase(),pc.toULong().toString(16))}
        private data class Tag(val field:Int,val type:Int)
        private fun key():Tag{val k=value(0);if(k<8||k ushr 32 !=0L)throw ParseFailure();return Tag((k ushr 3).toInt(),(k and 7).toInt()).also{if(it.field<=0)throw ParseFailure()}}
        private fun value(type:Int):Long{if(type!=0)throw ParseFailure();var result=0L;for(i in 0..9){val b=read();if(i==9&&b>1)throw ParseFailure();result=result or ((b and 0x7f).toLong() shl (7*i));if((b and 0x80)==0)return result};throw ParseFailure()}
        private fun bytes(type:Int):ByteArray{if(type!=2)throw ParseFailure();val n=value(0);if(n>MAX_BYTES||n>Int.MAX_VALUE)throw ParseFailure();val out=ByteArray(n.toInt());readFully(out);return out}
        private fun text(type:Int):String{val b=bytes(type);return try{StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(b)).toString()}catch(_:Exception){throw ParseFailure()}}
        private fun skip(type:Int){when(type){0->value(0);1->repeatRead(8);2->bytes(2);5->repeatRead(4);else->throw ParseFailure()}}
        private fun repeatRead(n:Int){repeat(n){read()}}
        private fun read():Int=input.read().takeIf{it>=0}?:throw ParseFailure()
        private fun readFully(out:ByteArray){var offset=0;while(offset<out.size){val n=input.read(out,offset,out.size-offset);if(n<0)throw ParseFailure();offset+=n}}
    }
}
