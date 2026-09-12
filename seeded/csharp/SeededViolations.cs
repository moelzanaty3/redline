// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
using System;
using System.Data.SqlClient;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace Redline.Seed;

[ApiController]
[Route("accounts")]
public class SeededViolationsController : ControllerBase
{
    // SEED 1 [BLOCKER] (core/hardcoded-secrets) hardcoded connection string with credentials
    private const string ConnectionString =
        "Server=prod-sql;Database=billing;User Id=sa;Password=Pr0d-S3cret-2026!;";

    // SEED 2 [BLOCKER] (csharp/httpclient-per-request) HttpClient instantiated per request — socket exhaustion
    private readonly HttpClient _http = new HttpClient();

    // SEED 3 [BLOCKER] (csharp/async-void) async void — the exception escapes and takes the process down
    public async void FireAndForget(string id)
    {
        await _http.GetAsync($"https://internal/audit/{id}");
    }

    [HttpGet]
    public IActionResult Find(string name)
    {
        using var conn = new SqlConnection(ConnectionString);
        conn.Open();
        // SEED 4 [BLOCKER] (csharp/sql-string-concatenation) SQL built by concatenation with request input
        var cmd = new SqlCommand("SELECT * FROM accounts WHERE name = '" + name + "'", conn);

        // SEED 5 [BLOCKER] (csharp/sync-over-async) sync-over-async deadlocks and starves the thread pool
        var balance = _http.GetStringAsync("https://internal/balance").Result;

        try
        {
            cmd.ExecuteNonQuery();
        }
        catch
        {
            // SEED 6 [BLOCKER] (csharp/swallowed-exceptions) exception swallowed, failure reported as success
        }

        // SEED 7 [HIGH] (csharp/entity-in-controller-response) entity returned straight from the controller
        return Ok(new AccountEntity { Msisdn = name, Balance = balance });
    }

    // SEED 8 [HIGH] (csharp/datetime-now) DateTime.Now in new code instead of DateTimeOffset.UtcNow
    [HttpGet("now")]
    public DateTime Now() => DateTime.Now;

    // SEED 9 [HIGH] (csharp/exception-detail-in-response) exception detail leaked to the caller
    [HttpGet("boom")]
    public IActionResult Boom()
    {
        try
        {
            throw new InvalidOperationException("db=prod-sql user=sa");
        }
        catch (Exception ex)
        {
            return StatusCode(500, ex.ToString());
        }
    }
}

public class AccountEntity
{
    public string Msisdn { get; set; } = "";
    public string Balance { get; set; } = "";
}

public static class Coercion
{
    // SEED 10 [BLOCKER] (core/type-checker-suppression) compiler warning suppressed with no explanation and no ticket
#pragma warning disable CS0168
    public static string Read(string raw)
    {
        Exception unused;
        return raw;
    }
#pragma warning restore CS0168
}
