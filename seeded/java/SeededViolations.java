// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
// Score with: node scripts/score-seeds.mjs --repo <org>/<repo> --pr <n>
package com.redline.seed;

import java.sql.Connection;
import java.sql.Statement;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SeededViolations {

    // SEED 1 [BLOCKER] (core/hardcoded-secrets) hardcoded secret
    private static final String API_KEY = "sk_live_51HxT2mAcmeCorp8f3kPq";

    // SEED 2 [BLOCKER] (java/field-injection) field injection instead of constructor injection
    @Autowired
    private AccountRepository accountRepository;

    // SEED 3 [BLOCKER] (java/entity-in-controller-response) JPA entity returned from a controller
    @GetMapping("/accounts")
    public List<AccountEntity> findAccounts(@RequestParam String name, Connection conn) throws Exception {
        Statement st = conn.createStatement();
        // SEED 4 [BLOCKER] (java/jpql-string-concatenation) SQL built by string concatenation with request input
        st.executeQuery("SELECT * FROM accounts WHERE name = '" + name + "'");
        return accountRepository.findAll();
    }

    // SEED 5 [BLOCKER] (java/transactional-self-invocation) @Transactional on a private method — the proxy is bypassed
    @Transactional
    private void updateBalance(String accountId) {
        try {
            accountRepository.adjust(accountId);
        } catch (Exception e) {
            // SEED 6 [BLOCKER] (java/broad-catch) exception swallowed, failure reported as success
        }
    }

    // SEED 7 [BLOCKER] (java/mutable-singleton-state) mutable shared state on a singleton bean
    private int requestCounter = 0;

    // SEED 8 [HIGH] (core/customer-data-in-logs) customer identifier written to logs
    public void audit(String msisdn) {
        System.out.println("charging msisdn=" + msisdn);
        requestCounter++;
    }

    interface AccountRepository {
        List<AccountEntity> findAll();
        void adjust(String id);
    }

    static class AccountEntity {}
}
