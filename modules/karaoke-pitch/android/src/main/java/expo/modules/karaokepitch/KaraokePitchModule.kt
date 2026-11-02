package expo.modules.karaokepitch

import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.concurrent.thread
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

// Grid giống hệt karaoke-pitch-worklet.js bên web — server chấm điểm dựa trên grid này
private const val TARGET_RATE = 22050
private const val FRAME_SIZE = 2048
private const val HOP_SIZE = 512
private const val MIN_LAG = 19      // ceil(22050 / 1200)
private const val MAX_LAG = 339     // floor(22050 / 65)
private const val SILENCE_RMS = 0.0017782794100389228 // 10^(-55/20)
private const val YIN_THRESHOLD = 0.15
private const val FRAMES_PER_MESSAGE = TARGET_RATE / HOP_SIZE // 43

private enum class CaptureState { IDLE, RECORDING, ABORT, FINALIZE }

/**
 * Pitch capture + YIN cho chấm điểm Karaoke.
 * Ghi micro 22050Hz mono PCM16, tính f0 theo từng frame 2048/hop 512 trong lúc đang hát
 * (giống AudioWorklet bên web), gửi batch qua event "onFeatures" và tổng kết qua "onSummary".
 */
class KaraokePitchModule : Module() {
  private val ring = FloatArray(FRAME_SIZE)
  private val frame = FloatArray(FRAME_SIZE)
  private val difference = DoubleArray(MAX_LAG + 1)

  private var ringIndex = FRAME_SIZE / 2
  private var contextSamples = FRAME_SIZE / 2.toLong()
  private var realSamples = 0.toLong()
  private var framesProcessed = 0.toLong()

  private var audioSamples = 0.toLong()
  private var sumSquares = 0.0
  private var clippedSamples = 0.toLong()

  private val pendingPitches = ArrayList<Double?>()
  private val pendingProbabilities = ArrayList<Double>()

  @Volatile private var state = CaptureState.IDLE
  private var captureThread: Thread? = null

  override fun definition() = ModuleDefinition {
    Name("KaraokePitch")

    Events("onFeatures", "onSummary", "onError")

    AsyncFunction("start") {
      val context = appContext.reactContext
        ?: throw CodedException("MIC_UNAVAILABLE", "Không lấy được context ứng dụng.", null)
      if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        throw CodedException("MIC_PERMISSION", "Chưa cấp quyền micro cho ứng dụng.", null)
      }
      val previous = captureThread
      if (previous != null && previous.isAlive) {
        previous.join(1500)
      }
      if (state != CaptureState.IDLE || (captureThread?.isAlive == true)) {
        throw CodedException("ALREADY_RECORDING", "Bản thu pitch trước vẫn đang chạy, hãy thử lại.", null)
      }
      resetCapture()
      state = CaptureState.RECORDING
      captureThread = thread(name = "karaoke-pitch-capture") { captureLoop() }
    }

    Function("abort") {
      if (state == CaptureState.RECORDING) state = CaptureState.ABORT
    }

    Function("finalize") {
      if (state == CaptureState.RECORDING) state = CaptureState.FINALIZE
    }

    Function("isCapturing") {
      state != CaptureState.IDLE
    }

    OnDestroy {
      state = CaptureState.ABORT
    }
  }

  private fun resetCapture() {
    ring.fill(0f)
    ringIndex = FRAME_SIZE / 2
    contextSamples = (FRAME_SIZE / 2).toLong()
    realSamples = 0
    framesProcessed = 0
    audioSamples = 0
    sumSquares = 0.0
    clippedSamples = 0
    pendingPitches.clear()
    pendingProbabilities.clear()
  }

  private fun captureLoop() {
    var record: AudioRecord? = null
    try {
      val minBuffer = AudioRecord.getMinBufferSize(TARGET_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      if (minBuffer <= 0) {
        sendEvent("onError", mapOf("message" to "Thiết bị không hỗ trợ ghi âm 22050Hz."))
        return
      }
      val bufferSize = max(minBuffer, FRAME_SIZE * 4)
      record = AudioRecord.Builder()
        .setAudioSource(MediaRecorder.AudioSource.MIC)
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(TARGET_RATE)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .build()
        )
        .setBufferSizeInBytes(bufferSize)
        .build()
      if (record.state != AudioRecord.STATE_INITIALIZED) {
        sendEvent("onError", mapOf("message" to "Không mở được micro (bị ứng dụng khác chiếm hoặc chưa cấp quyền)."))
        return
      }
      record.startRecording()
      val chunk = ShortArray(1024)
      while (state == CaptureState.RECORDING) {
        val count = record.read(chunk, 0, chunk.size)
        if (count > 0) {
          for (i in 0 until count) {
            onInputSample(chunk[i] / 32768f)
          }
        } else if (count < 0) {
          sendEvent("onError", mapOf("message" to "Ghi âm bị gián đoạn, bản thu đã hủy."))
          break
        }
      }
      if (state == CaptureState.FINALIZE) {
        finishCapture()
      } else if (state == CaptureState.ABORT) {
        flushFeatures()
      }
    } catch (e: Exception) {
      sendEvent("onError", mapOf("message" to (e.message ?: "Lỗi ghi âm không xác định.")))
    } finally {
      try { record?.stop() } catch (_: Exception) {}
      try { record?.release() } catch (_: Exception) {}
      state = CaptureState.IDLE
    }
  }

  private fun onInputSample(value: Float) {
    audioSamples += 1
    sumSquares += value.toDouble() * value.toDouble()
    if (abs(value) >= 0.999f) clippedSamples += 1

    ring[ringIndex] = value
    ringIndex = (ringIndex + 1) % FRAME_SIZE
    contextSamples += 1
    realSamples += 1
    if (contextSamples >= FRAME_SIZE && (contextSamples - FRAME_SIZE) % HOP_SIZE == 0.toLong()) {
      processFrame()
    }
  }

  private fun processFrame() {
    var frameSumSquares = 0.0
    for (i in 0 until FRAME_SIZE) {
      val value = ring[(ringIndex + i) % FRAME_SIZE]
      frame[i] = value
      frameSumSquares += value.toDouble() * value.toDouble()
    }
    val rms = sqrt(frameSumSquares / FRAME_SIZE)
    var pitch: Double? = null
    var confidence = 0.0
    if (rms >= SILENCE_RMS) {
      val estimate = yin()
      if (estimate != null) {
        pitch = estimate.first
        confidence = estimate.second
      }
    }
    pendingPitches.add(pitch)
    pendingProbabilities.add(confidence)
    framesProcessed += 1
    if (pendingPitches.size >= FRAMES_PER_MESSAGE) flushFeatures()
  }

  // Thuật toán YIN — port 1:1 từ karaoke-pitch-worklet.js của web
  private fun yin(): Pair<Double, Double>? {
    val compareLength = FRAME_SIZE - MAX_LAG
    var runningDifference = 0.0
    var bestLag = -1
    var bestValue = Double.POSITIVE_INFINITY

    for (lag in 1..MAX_LAG) {
      var difference = 0.0
      for (i in 0 until compareLength) {
        val delta = frame[i] - frame[i + lag]
        difference += delta * delta
      }
      runningDifference += difference
      val normalized = if (runningDifference > 0) difference * lag / runningDifference else 1.0
      this.difference[lag] = normalized
      if (lag >= MIN_LAG && normalized < bestValue) {
        bestValue = normalized
        bestLag = lag
      }
    }

    if (bestLag < MIN_LAG || bestValue > 0.35) return null
    var selectedLag = bestLag
    for (lag in MIN_LAG..MAX_LAG) {
      if (this.difference[lag] < YIN_THRESHOLD) {
        selectedLag = lag
        while (selectedLag < MAX_LAG && this.difference[selectedLag + 1] < this.difference[selectedLag]) {
          selectedLag += 1
        }
        bestValue = this.difference[selectedLag]
        break
      }
    }

    val left = this.difference[max(MIN_LAG, selectedLag - 1)]
    val center = this.difference[selectedLag]
    val right = this.difference[min(MAX_LAG, selectedLag + 1)]
    val denominator = left - 2 * center + right
    val shift = if (abs(denominator) > 1e-12) 0.5 * (left - right) / denominator else 0.0
    val refinedLag = selectedLag + shift.coerceIn(-0.5, 0.5)
    val pitch = TARGET_RATE / refinedLag
    if (!pitch.isFinite() || pitch < 60 || pitch > 1300) return null
    return Pair(pitch, (1 - bestValue).coerceIn(0.0, 1.0))
  }

  private fun flushFeatures() {
    if (pendingPitches.isEmpty()) return
    sendEvent(
      "onFeatures",
      mapOf(
        "f0_hz" to pendingPitches.toList(),
        "voiced_probability" to pendingProbabilities.toList()
      )
    )
    pendingPitches.clear()
    pendingProbabilities.clear()
  }

  private fun finishCapture() {
    val expectedFrames = (realSamples + HOP_SIZE - 1) / HOP_SIZE
    while (framesProcessed < expectedFrames) appendPaddingSample()
    flushFeatures()
    val meanSquare = if (audioSamples > 0) sumSquares / audioSamples else 0.0
    sendEvent(
      "onSummary",
      mapOf(
        "duration_seconds" to realSamples.toDouble() / TARGET_RATE,
        "rms_dbfs" to (if (meanSquare > 0) 10.0 * log10(meanSquare) else -240.0),
        "clipped_fraction" to (if (audioSamples > 0) clippedSamples.toDouble() / audioSamples else 0.0),
        "frame_count" to framesProcessed
      )
    )
  }

  private fun appendPaddingSample() {
    ring[ringIndex] = 0f
    ringIndex = (ringIndex + 1) % FRAME_SIZE
    contextSamples += 1
    if (contextSamples >= FRAME_SIZE && (contextSamples - FRAME_SIZE) % HOP_SIZE == 0.toLong()) {
      processFrame()
    }
  }
}
