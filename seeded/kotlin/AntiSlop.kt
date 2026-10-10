// DO NOT MERGE — Redline validation seed (anti-slop rules).
package seeded

class CardGateway : PaymentGateway {
    // SEED 1 [BLOCKER] (kotlin/todo-stub) placeholder ships and crashes the first call
    override fun charge(amount: Money): Receipt = TODO("Not yet implemented")
}

fun load(api: Api, id: String) = try { api.fetch(id) } catch (e: java.io.IOException) {
    // SEED 2 [HIGH] (kotlin/dropped-exception-cause) only the message survives
    throw RepositoryException(e.message)
}

fun addToCart(state: CartState, item: Item) {
    // SEED 3 [HIGH] (kotlin/downcast-readonly-collection) read-only list cast to mutable
    (state.items as MutableList<Item>).add(item)
}

fun render(state: PaymentState) = when (state) {
    is PaymentState.Failed -> showError(state.reason)
    // SEED 4 [HIGH] (kotlin/else-on-exhaustive-when) new variants fall into the default
    else -> showSuccess()
}

fun push(sync: SyncService, changes: List<Change>) {
    try { sync.push(changes) }
    // SEED 5 [HIGH] (kotlin/print-stack-trace) bypasses crash reporting
    catch (e: java.io.IOException) { e.printStackTrace() }
}

// SEED 6 [HIGH] (kotlin/implicit-default-locale) machine-read amount formatted in the device locale
fun body(total: Double) = mapOf("amount" to "%.2f".format(total))
