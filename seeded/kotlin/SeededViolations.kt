// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
package com.redline.seed

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

object SeededViolations {

    // SEED 1 [BLOCKER] (core/hardcoded-secrets) hardcoded credential
    private const val API_KEY = "sk_live_51HxT2mAcmeCorp8f3kPq"

    // SEED 2 [BLOCKER] (kotlin/context-leak) Activity Context held by a singleton — leaks the whole view tree
    var context: Context? = null

    // SEED 3 [HIGH] (kotlin/public-mutable-state) public MutableStateFlow — callers can mutate UI state directly
    val state = MutableStateFlow("")

    fun load(msisdn: String) {
        // SEED 4 [BLOCKER] (kotlin/globalscope) GlobalScope leaks work past the owner's lifecycle
        GlobalScope.launch {
            // SEED 5 [BLOCKER] (kotlin/blocking-in-coroutine) blocking call inside a coroutine
            Thread.sleep(1000)

            // SEED 6 [BLOCKER] (core/customer-data-in-logs) customer identifier in logs
            println("loading balance for $msisdn")

            try {
                fetch(msisdn)
            } catch (e: Exception) {
                // SEED 7 [BLOCKER] (kotlin/broad-catch-cancellation) broad catch also swallows CancellationException
            }
        }
    }

    // SEED 8 [BLOCKER] (kotlin/force-unwrap) !! non-null assertion in a production path
    fun title(map: Map<String, String>): String = map["title"]!!

    private suspend fun fetch(msisdn: String): String {
        // SEED 9 [BLOCKER] (kotlin/blocking-in-coroutine) runBlocking inside a suspend function
        return runBlocking(Dispatchers.Main) { "$API_KEY/$msisdn" }
    }
}

// SEED 10 [HIGH] (kotlin/data-class-var) data class with var properties breaks copy/equality semantics
data class Account(var id: String, var balance: Int)
