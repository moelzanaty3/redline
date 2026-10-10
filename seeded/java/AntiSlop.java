// DO NOT MERGE — Redline validation seed (anti-slop rules).
package seeded;

import java.math.BigDecimal;

class AntiSlop {
  boolean isAdmin(String role) {
    // SEED 1 [BLOCKER] (java/reference-equality) String compared by identity
    return role == "admin";
  }

  BigDecimal vat(BigDecimal net) {
    // SEED 2 [BLOCKER] (java/bigdecimal-value-semantics) double constructor captures rounding error
    BigDecimal rate = new BigDecimal(0.2);
    return net.multiply(rate);
  }

  Order load(Repo repo, String id) {
    try { return repo.load(id); }
    // SEED 3 [HIGH] (java/dropped-exception-cause) only the message survives
    catch (java.sql.SQLException e) { throw new ServiceException(e.getMessage()); }
  }

  void poll() {
    while (running) {
      try { Thread.sleep(1000); }
      // SEED 4 [HIGH] (java/swallowed-interrupt) interrupt status erased
      catch (InterruptedException e) { log.warn("interrupted"); }
    }
  }

  void send(Client client, Event evt) {
    try { client.send(evt); }
    // SEED 5 [HIGH] (java/print-stack-trace) stderr, outside logging
    catch (java.io.IOException e) { e.printStackTrace(); }
  }

  User find(String email) {
    // SEED 6 [HIGH] (java/ignored-pure-result) result of toLowerCase discarded
    email.toLowerCase();
    return users.findByEmail(email);
  }

  @org.junit.jupiter.api.Test void rejectsNegative() {
    // SEED 7 [HIGH] (java/test-without-assertion) expected exception with no fail()
    try { svc.charge(-1); } catch (IllegalArgumentException expected) { }
  }
}
