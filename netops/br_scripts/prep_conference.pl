#!/usr/bin/perl

# ---
#BR_description: Create estream queue on server
#BR_startup: running=always
#BR__END: 
# ---

# ---
$|++;
use BRDB;
use REST::Client;

# ---
sub get_assigned_conferences
{
    $conferences = [];
    db_select("SELECT id,name,fs_server,conference_key FROM conferences WHERE state='assigned'",'conferences',$dbh) or die;
    return $#{$conferences}+1;
}

# ---
sub prep_conferences
{
    # ---
    foreach my $r(@{$conferences}) {
        die if not defined $r->{fs_server};
        my $client = REST::Client->new();
        next if not $r->{fs_server} =~ /ipv4=([^,]+)/;
        my $host = $1;
        $host .= ":$1" if $r->{fs_server} =~ /es_port=(\d+)/;
        my $url = "http://$host/conference/$r->{id}";
        my $data =  <<__EOT__
LConference queue $r->{id} created
__EOT__
;
        $client->POST($url, $data) or die "failed to POST to [$url]\n";
        die "bad response from [$url]\n" if $client->responseCode() ne '200';
        db_exec($dbh,"UPDATE conferences SET state='queue_created', updated_at=NOW() WHERE id=$r->{id}",_rows);
        if ($_rows>0) {
            print "Conference queue created on $url:\n";
            print "================================================================================\n";
            print "$data";
            print "================================================================================\n";
            }
        }
}

# ---
$dbh = db_quick_connect();

# ---
for(my $it=0; $it<$ENV{BR_ITERATIONS}; $it++) 
{
    $did_something = 0;

    # ---
    if (get_assigned_conferences()) {
        if (prep_conferences()) {
            $did_something = 1;
            }
        }

    # ---
    sleep $ENV{BR_SLEEP_SHORT} if not $did_something;
}

# ---
db_disconnect($dbh);

exit 0;

