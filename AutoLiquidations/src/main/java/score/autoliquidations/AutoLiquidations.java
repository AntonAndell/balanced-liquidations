package score.autoliquidations;

import java.math.BigInteger;

import score.Context;
import score.Address;
import score.annotation.External;

import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

public class AutoLiquidations {
    public static Address dex;
    public static Address bnusd;
    public static Address loans;
    public static byte[] swapData;
    public boolean inRoute = false;

    public AutoLiquidations(Address dex, Address bnusd, Address loans) {
        AutoLiquidations.dex = dex;
        AutoLiquidations.bnusd = bnusd;
        AutoLiquidations.loans = loans;
        AutoLiquidations.swapData = ("{\"method\":\"_swap\",\"params\":{\"toToken\":\"" + bnusd.toString() + "\"}}").getBytes();
    }


    public void liquidate(String address, BigInteger amount, String symbol) {
        Context.call(loans, "liquidate", address, amount, symbol);
    }

    @External
    public void tokenFallback(Address _from, BigInteger _value, byte[] _data) {
        if (Context.getCaller().equals(bnusd) && !inRoute) {
            JsonObject json = Json.parse(new String(_data)).asObject();

            String address = json.get("address").asString();;
            String symbol = json.get("symbol").asString();;
            inRoute = true;
            liquidate(address, _value, symbol);
            BigInteger balance = Context.call(BigInteger.class,  bnusd, "balanceOf", Context.getAddress());

            Context.require(balance.compareTo(_value) >= 0 );
            Context.call(bnusd, "transfer", _from, balance);
            inRoute = false;

        } else if (!Context.getCaller().equals(bnusd)) {
            Context.call(Context.getCaller(), "transfer", dex, _value, swapData);
        }

    }
}
